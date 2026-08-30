## Context

See proposal.md — Why. What shapes the approach is what already exists.

Skills already have the two-list arrangement this change copies: `skillPaths` is the
deployment's and unreachable from the interface, `userSkillPaths` is the user's and
editable, and `allSkillPaths()` concatenates them wherever the agent needs the whole
set. `handleUpdateConfig` persists first, then rebuilds — roots, git, watcher and
toolset in one `rebuildResources` call, then a session replacement — and it recomputes
`sandbox.readExceptions` from the current path lists rather than carrying the old ones
over, since a resource directory outside the sandbox root would otherwise be one the
agent is forbidden to read.

Three facts from the pi SDK decide most of the rest:

- `discoverAndLoadExtensions` resolves a *directory* in the configured paths — a
  `package.json` with a `pi.extensions` field, else `index.ts`/`index.js`, else the
  loose `.ts`/`.js` files one level down. A directory picker is therefore enough.
- `Skill` carries a `sourceInfo`, but it does not group the way it looks like it will —
  see the decision below, which was measured rather than assumed.
- Extensions are loaded through jiti and run with the agent's privileges. There is no
  sandbox around an extension, which is what makes the warning and the lock part of the
  feature rather than decoration.

Two constraints from this server: `handleUpdateConfig` already refuses outright on a
runtime that cannot rebuild its own tools (an RPC child builds its own), and
`ServerPathPicker` selects the directory it is currently showing — it has no notion of
picking a file.

## Goals / Non-Goals

**Goals:**

- One arrangement for both resource kinds, so a reader of `config.ts` or
  `handleUpdateConfig` finds skills and extensions expressed the same way.
- A settings menu that stays legible at the scale its owner actually has.

**Non-Goals:**

- Enabling or disabling an individual extension. The unit is the path, as it is for
  skills.
- Grouping or attributing skills by where they came from. Measured and dropped — see
  the decision below.
- Making extension paths editable under an RPC runtime. That refusal already exists for
  every editable setting and is not weakened here.
- A file picker. The SDK's directory discovery removes the need, and adding one would
  be a second way to say the same thing.

## Decisions

**Copy the skills arrangement rather than generalise it.** `userExtensionPaths` beside
`extensionPaths`, an `allExtensionPaths()` beside `allSkillPaths()`, the same key in
`EditableSettings`, the same resolution against the configuration file's directory. The
alternative — one generic "resource paths" abstraction covering skills, prompts and
extensions — would collapse four call sites into one at the cost of making every
future difference between them awkward, and there is already one difference that
matters: only extensions get a lock and a warning. Two similar things stated plainly
beat one thing with exceptions.

**`extensionLock` as a boolean, following `workspaceLock`.** Not a member of
`sandboxLocks`: that structure locks *fields of the sandbox*, and extension paths are
not one. `workspaceLock` is the existing precedent for a server-wide capability the
deployment withholds, and it is the convention `config.ts` already documents. Enforced
in `handleUpdateConfig` before anything is persisted, and reported in the snapshot so
the interface can draw nothing rather than draw a control that fails.

**Enforce the lock server-side and report it, rather than only hiding the control.**
The snapshot flag exists so the interface can be honest; the refusal exists because a
client is not a trust boundary. This mirrors how `workspaceLock` refuses
`handleOpenProject` regardless of what the client offered.

**Sort the inventories; do not attribute them.** The first plan was to group skills by
where each came from, using `Skill.sourceInfo`. Probing a real server before writing the
mapping showed `sourceInfo.baseDir` is the *skill's own* directory, not the configured
root it was found under. A directory holding two skills therefore yields two groups, and
each bundled skill one of its own — while `~/.agents` happens to collapse into a single
clean group of 31 and packages group by name. It works for the cases nobody asked about
and fails on the one that motivated it: what did the directory I just added contribute?

Making it work would mean matching each skill's `filePath` against the longest
configured root — `allSkillPaths(config)` and the bundled set — which means plumbing
that root list into `embeddedRuntime`, where it does not belong, to feed a display
concern. A stable sort answers the legibility problem on its own, and the wire stays as
it is: no `origin` on `CommandInfo`, no mapping of the SDK's shape into ours, nothing
for a runtime to omit. Rejected alternative kept on the record because the measurement
is the reason: the grouping key looked available and was not.

**One counted summary per inventory, `<details>` again.** The count is what makes a
collapsed list useful — "3 extensions loaded" answers the question without opening
anything. `<details>`/`<summary>` rather than a custom accordion: keyboard- and
screen-reader-correct with no work, and already the idiom in this menu for tools and
skills. The extensions section is the one that has no disclosure at all today.

**Distinguish an empty extension inventory from an unknowable one.** `extensionPaths`
in the snapshot is `getExtensionPaths()` — what the embedded runtime *loaded*. The RPC
runtime reports `[]` today, which the interface draws as "No extensions loaded" while
the child may have loaded several. Model it as absent-versus-empty on the wire
(`extensionPaths?: string[]`, omitted when the runtime cannot report) so the interface
can say "not reported by this runtime". This is a small honesty fix inside the section
this change is already rewriting; doing it later would mean touching the same component
twice.

**Warn in the flow, at the moment of adding.** The warning appears when the picker for
an extension path is opened, not as a permanent caption above the list: a caption that
is always there is read once and then never again, and this one is about an act. It
names the two things that are true and non-obvious — the code runs with the agent's
privileges, and a directory loads everything inside it. No confirmation checkbox: the
apply button is already the deliberate step, and a second one would train the reflex
that dismisses it.

## Risks / Trade-offs

- **The interface becomes a way to make the server run arbitrary code.** → It always
  was, for anyone who could edit the configuration file; what changes is who can do it
  without shell access. Mitigated by `extensionLock` for deployments that hand the
  interface to someone else, by the warning for those that do not, and by the fact that
  the picker browses the server's own filesystem — a path has to already exist there.
- **A bad extension can break the session it is added to.** The SDK reports a load
  failure per extension rather than aborting, so the session survives; but an extension
  that loads and misbehaves is inside the agent. → Removal is one click and rebuilds the
  session, the same path as adding. Worth an explicit test that removing a path that
  broke the session recovers it.
- **A collapsed inventory hides what an operator came to check.** → The count is on the
  summary line, which is the question being asked most of the time; opening is one
  click, and the state is per-section rather than per-menu.
- **Two similar path lists invite an editing mistake that touches the wrong one.** →
  The scenarios in `persistent-runtime-settings` assert each list's protection
  separately, and the existing skill-path tests would catch a regression there.

## Migration Plan

No migration. Both keys are optional and absent means empty, so an existing
configuration file loads unchanged and an older configuration file keeps working. A
server that has never had `userExtensionPaths` written gains it the first time an
extension path is applied, exactly as `userSkillPaths` and `openProjects` do. Rollback
is removing the key by hand; the deployment's own `extensionPaths` are never touched.
