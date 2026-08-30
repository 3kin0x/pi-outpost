## Why

Skills can be added from the interface; extensions cannot. The settings menu shows
extension paths as a dead list — no picker, no removal, no persistence — while the
skills section right above it has all three. An operator who wants to load their own
extension has to edit the configuration file by hand and restart, which is exactly what
`userSkillPaths` was introduced to stop being necessary.

The same section has outgrown itself in the other direction. Skills arrive as one flat
list behind a single disclosure, and an installation with a few plugins now has dozens.
The list says which skills exist and nothing about where any of them came from — so
after adding a skills directory, there is no way to see what it actually contributed.

## What Changes

- **User extension paths, editable from Settings.** A new `userExtensionPaths`
  configuration key, held apart from the deployment's `extensionPaths` exactly as
  `userSkillPaths` is held apart from `skillPaths`. The settings menu gains the same
  directory picker, the same per-entry removal, and the same persist-then-rebuild
  apply. The pi SDK already discovers extensions inside a configured directory —
  `package.json` with a `pi.extensions` field, an `index.ts`, or loose `.ts`/`.js`
  files — so the existing directory picker is sufficient and no file picker is needed.
- **A warning at the point of adding one.** An extension is code that runs with the
  agent's privileges, and adding a *directory* loads every extension found inside it.
  The interface SHALL say so before the path is added, in the flow rather than in a
  tooltip. Skills stay as they are: they are text the model reads.
- **A deployment lock.** `extensionLock` follows the `workspaceLock` convention — when
  set, the server refuses interface-driven changes to extension paths and the interface
  offers no affordance for them. A deployment that hands the interface to someone else
  can keep code-loading to itself.
- **One counted summary per inventory.** Every list the menu presents opens from a
  single line saying how many it holds — "3 extensions loaded" — instead of being drawn
  open. The extensions section has no disclosure at all today, and a menu whose sections
  are all expanded is one an installation with many resources cannot read. The lists are
  sorted so they read the same way twice.

- **The extension inventory becomes honest about RPC.** `extensionPaths` in the
  snapshot is the list of *loaded* extension files, and an RPC runtime reports `[]`
  while its child may well have loaded several. The interface SHALL distinguish "none"
  from "not knowable here" rather than showing an empty list as though it were a fact.

## Capabilities

### New Capabilities

None. Every behaviour here extends a capability that already exists.

### Modified Capabilities

- `config`: a `userExtensionPaths` key written by the interface, and an `extensionLock`
  following the established lock convention.
- `persistent-runtime-settings`: extension paths added through Settings are persisted
  and survive a restart; the configuration file's own `extensionPaths` are never
  rewritten or removed by an apply; a lock is honoured server-side, not only hidden in
  the UI.
- `api`: the snapshot carries the user's extension paths and whether they are locked,
  `update_config` accepts them, and the loaded-extension inventory becomes absent rather
  than empty where a runtime cannot report one.
- `components`: `SettingsMenu` edits extension paths with the same controls it offers
  for skills, warns before adding one, hides the controls when locked, and presents
  every inventory behind one counted summary line.

## Impact

- `server/src/config.ts` — the new key, the lock, parsing, and `EditableSettings`.
- `server/src/index.ts` — `handleUpdateConfig` (validation, lock enforcement, persist,
  `readExceptions` recomputation, session rebuild) and the snapshot.
- `server/src/rpcRuntime.ts` — an inventory that says it cannot know rather than
  reporting none.
- `shared/src/protocol.ts` — `userExtensionPaths`, `configuredExtensionPaths`, the lock
  flag, and `extensionPaths` documented as absent-when-unknowable.
- `ui/src/components/SettingsMenu.tsx` — the extension controls, the warning, the lock,
  and the counted summaries; `PickerField` gains an `extension` member.
- Tests: server settings-persistence and lock behaviour, UI component tests for the
  warning and the grouping, and a Playwright pass since this is interface work.
