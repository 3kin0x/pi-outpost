## Context

See proposal.md — Why.

The shape of the constraint, in code as it stands:

- `server/src/workspace.ts:333` builds `git: { toplevel: string } | null` from one `probeGit(browserRoot)` call. It is a constant for the life of the workspace resources, not a lookup.
- Every git RPC in `server/src/index.ts:2818-2914` spawns with `cwd = workspace.browserRoot` and passes `workspace.git.toplevel` for path translation.
- `server/src/git.ts` rests its security argument on one invariant, stated in its header: a fixed `cwd` at the browser root plus a trailing pathspec (`-- .` or the single confined file), so git cannot report content outside the root.
- On the wire (`shared/src/protocol.ts:639`), `git_status` answers `{ branch, ahead, behind, files }` — one branch for the workspace. `git_log` (`:766`) and `git_show` (`:768`) carry no path or repository at all; they are implicitly "the workspace's repository".
- In the UI, `GitMenu.tsx:41` renders that single branch, and `Header.test.tsx:122` asserts the chip appears only when `gitAvailable`.

Two consumer classes matter, and they need different things. File-scoped features (tree badges, worktree diff, file history, revision-pair diff) already take a toplevel as an argument — they need only a resolver. Repository-scoped features (branch chip, commit log, commit patch) need a repository chosen, and that is where the design work is.

Ambient constraint: `add-workspace-ready-for-review` is being implemented concurrently and also touches `server/src/index.ts`, `shared/src/protocol.ts` and `multi-project-workspaces`. Its spec delta covers workspace *activity*; this one covers `IsolateWorkspacesFromEachOther` only. No requirement overlaps, but the same files will be edited.

## Goals / Non-Goals

**Goals:**

- One resolution rule — longest matching repository toplevel — serving every git request that names a path.
- Badges present before the user clicks, so a tracked leaf is identifiable as tracked.
- Repository-scoped features bound to the current selection, with no new control on screen.
- The confinement invariant of `git.ts` preserved when `cwd` is no longer a single fixed directory.
- Status cost that scales with what is being looked at, not with the number of repositories on disk.

**Non-Goals:**

- Any aggregate across repositories: no merged commit log, no combined branch display, no "3 repos, 5 changes" summary.
- A repository picker control.
- Write-capable git, submodule-aware traversal, or anything that mutates a repository.
- Changing how projects are opened, closed or switched, or how the agent's sandbox is bounded.
- Reworking `openProjects` so a directory of repositories opens as many workspaces — that is a different change.

## Decisions

### Discovered repository set, not per-path `rev-parse`

The workspace holds `repos: RepoSet` — an ordered list of toplevels under (or containing) the browser root. Resolution is a longest-prefix match over that list: pure, synchronous, no process spawned.

*Alternative — `rev-parse --show-toplevel` with `cwd = dirname(path)` per request.* Correct and trivially small, and it is what one reaches for first. It costs one process per resolution. Tree badges resolve every visible file on every refresh, and refresh fires on `file_changed` and `agent_end`; a workspace of a few hundred files would spawn a few hundred `git` processes per keystroke-driven save. Rejected on cost, not correctness.

*Alternative — leave one repository and pick it from the open file.* Solves the chip, leaves badges dark until a file is opened, which is precisely the ordering the user asked to invert ("dès que je clique sur une feuille **suivie par git**" — the leaf must already look tracked). Rejected.

### Discovery scans for markers, bounded, and does not descend into a work tree

Walk from the browser root looking for a `.git` marker, reusing the file browser's existing exclusions (`node_modules` and friends) and a depth bound. On finding a marker, record the toplevel and stop descending that branch: repositories inside a repository's work tree are the submodule case, and the containing repository already accounts for them as gitlinks. A marker that is a *file* (linked work tree, submodule) counts as a repository.

*Alternative — ask git.* `git submodule status` or `--recurse-submodules` only answers when the parent is itself a repository. His parent is not. Rejected as inapplicable to the motivating case.

The ancestor case survives unchanged: if `probeGit(browserRoot)` returns a toplevel, it joins the set, and files under no nested repository resolve to it. `RepoLargerThanRoot` keeps holding.

### Status is one invocation per repository, merged, paths relative to the browser root

`gitStatus` becomes a fan-out: one `git status --porcelain=v2 --branch --untracked-files=all -- .` per repository, `cwd` at that repository's toplevel, run with bounded concurrency; each entry's path is rebased from repository-relative to browser-root-relative before merging. A single-repository workspace issues exactly one invocation, as today.

Cost control is by *scope*, not by caching: a `file_changed` event names a path, so only the repository owning it needs re-running. The full sweep happens on connect and on `agent_end`. Client-side coalescing already exists (`StatusRefresh`).

*Alternative — one `git status` from the browser root.* Does not see into nested repositories at all; the parent is not a repository in the motivating case, so there is nothing to run. Rejected.

### Repository identity on the wire is its path relative to the browser root

A repository is named by its browser-root-relative posix path (`""` when it is the root or an ancestor). The client needs a prefix to attribute files to repositories anyway, so an opaque id would buy nothing and cost a lookup table.

`git_status` gains `repos: { root, branch, ahead, behind }[]`; the flat `branch`/`ahead`/`behind` fields are removed rather than kept alongside, so there is one source of truth for a branch. `git_log` and `git_show` gain a `repo` field naming which repository to answer from. The client and the served UI ship in the same build, so this is a breaking protocol edit without a compatibility window; `@pi-outpost/embed` loads the UI from the server it talks to, so it moves with it.

### The chip follows the selection

No picker. The branch chip reads the repository owning the selected file. With no selection and exactly one repository, it names that one — the current behavior, unchanged for single-repository workspaces. With no selection and several, it stays visible and names no branch, rather than guessing or vanishing: `AlwaysNameTheProjectOnScreen` establishes that a control's first job is to say where the user is, and a chip that disappears says nothing. A selection owned by no repository leaves the chip where it was, since blanking it on every click into an unversioned file would make it flicker.

*Alternative — an explicit repository picker.* Adds a control for a choice the user already expressed by clicking a file. Kept in reserve if a use case appears for reading a repository's log without opening one of its files.

### Confinement extends per repository root

Every discovered toplevel is `realpath`-resolved and checked with the file browser's `isWithin`/`resolveConfined` before it may become a `cwd`. A symlinked directory whose real repository lies outside the browser root is excluded from the set. The header comment in `git.ts` is rewritten to state the invariant in its new form: `cwd` is the browser root or a *confined* repository toplevel, and the pathspec still bounds what git may report.

### Freshness is watcher-driven

The file watcher already runs per workspace. A change touching a `.git` marker debounces a re-scan of the affected subtree. Without this, a repository cloned during a session stays invisible until restart, which for a workspace whose whole purpose is holding many projects is a daily occurrence rather than an edge case.

*Alternative — TTL re-scan, or never.* A TTL spends work when nothing happened and still lags; never is the current behavior and is what makes this a bug report.

## Risks / Trade-offs

- **N `git status` processes per full refresh.** A directory of thirty repositories costs thirty spawns on connect and after each turn. → Bounded concurrency, and per-path scoping so ordinary edits re-run one repository. If it still bites, the fallback is to run only repositories that have a directory expanded in the tree; the spec is written in terms of what is visible, so that optimisation stays legal.
- **Deep or hostile trees make discovery slow.** → Depth bound, the file browser's existing exclusions, and no descent past a found repository. Discovery is async and the workspace serves non-git features while it runs.
- **Symlink escape via a repository root outside the root.** → `realpath` plus `isWithin` before any spawn; excluded repositories are never a `cwd`.
- **Submodules could be reported twice** — once as a repository of their own, once as a gitlink in the parent. → The parent reports a submodule as a single directory entry, not per-file, so no file path appears twice; the parent's gitlink entry is dropped when its path is a repository in the set.
- **Breaking protocol edit while another change is in flight.** `add-workspace-ready-for-review` edits `shared/src/protocol.ts` and `server/src/index.ts` concurrently. → Keep git changes to their own regions of those files, land whichever is ready first, rebase the other.
- **The chip changes as the user navigates.** Someone used to a fixed branch chip may read the change as the branch having changed. → The chip names the repository alongside the branch when the workspace holds more than one, so the movement is legible.
- **Ancestor plus nested repositories is genuinely ambiguous to a user.** A file inside a nested repository is invisible to the ancestor's status. → The longest-prefix rule is stated in the spec and matches what git itself does on the command line; no attempt is made to reconcile the two views.

## Migration Plan

No data migration, no persisted format change. A workspace whose root is a repository and which holds no nested repositories produces a one-element set and behaves exactly as before — that equivalence is the regression bar for the existing git tests. Rollback is a revert; nothing on disk is written by this change.

## Open Questions

- The depth bound for discovery, and whether the file browser's exclusion list is the right one to reuse verbatim. Both are tunable constants that do not change the specs or the task breakdown.
- Whether the chip should name the repository always, or only when the workspace holds more than one. A presentation detail, settled once it is seen running.
