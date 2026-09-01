## Why

A workspace is assumed to be one git repository. `probeGit` runs once when the workspace is built and stores a single toplevel; when the workspace root is not itself inside a repository, that probe returns nothing and the entire git surface goes dark — no branch chip, no tree badges, no worktree diff, no file history.

Developers who organise their work as a parent directory of independently versioned project folders hit exactly this. Every child is a repository, the parent is not, and pi-outpost shows them nothing. The repositories are there, under the browser root, fully readable; only the one-repository-per-workspace assumption stands between the user and the features that already exist.

## What Changes

- A workspace SHALL resolve git per path rather than holding one repository: it discovers the repositories under its browser root (plus the ancestor repository, when the root is inside one) and maps any path to the repository that owns it.
- Git availability stops being one boolean over the workspace. A workspace containing at least one repository offers git features; a file outside every repository offers none.
- File-scoped operations — tree badges, worktree diff, file commit history, revision-pair diff, file history graph — work for any tracked file under the browser root, whichever repository it belongs to.
- Repository-scoped operations — branch with ahead/behind, commit log, commit patch — follow the file the user has selected: opening a file in one project shows that project's branch and history, without a repository picker.
- Working-tree status covers every repository under the browser root, so a leaf is marked as tracked and changed before it is clicked.
- Confinement is preserved per repository: a discovered repository root becomes a git `cwd` only after passing the same confinement check the file browser uses, keeping the guarantee that git never reports content outside the browser root.
- No write operations, no repository picker control, no cross-repository aggregate view (no merged log, no combined branch display), and no change to how projects are opened or closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `git`: Replace single-repository detection with per-path repository resolution over a discovered repository set; extend confinement to multiple repository roots; scope working-tree status to all repositories under the browser root; bind branch, commit log and commit patch to the repository owning the current selection; state what the UI surface shows when a workspace holds several repositories or none.
- `multi-project-workspaces`: A workspace owns a set of repositories rather than one git state.

## Impact

- `server/src/workspace.ts`: the `git: { toplevel } | null` resource becomes a repository set with a resolver, discovered at workspace build and refreshed when repositories appear or disappear.
- `server/src/git.ts`: `probeGit` gains repository discovery; repository-scoped commands take the resolved repository root as their `cwd`; `gitStatus` reports across repositories.
- `server/src/index.ts`: the git RPC handlers stop reading `workspace.git.toplevel` and resolve the repository from the requested path.
- Shared protocol: git status entries and the session snapshot carry enough repository identity for the client to attribute a file and name a branch.
- `ui/src/components/GitMenu.tsx`, `Header.tsx`, `FileTree.tsx`, `FileViewer.tsx`: the branch chip reflects the selection's repository; badges span repositories.
- Server, protocol and UI tests, including a fixture workspace whose root is not a repository and whose children are.
- No new dependency, no write-capable git command, no change to sandbox boundaries or workspace lifecycle.
