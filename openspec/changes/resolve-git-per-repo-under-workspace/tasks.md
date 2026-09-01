## 1. Repository discovery and resolution

- [x] 1.1 Add a repository-set module in `server/src/git.ts`: discover `.git` markers under a root (directory *or* file markers), reusing the file browser's exclusion list, bounded in depth, not descending past a found repository; verify with unit tests over a temp fixture holding a nested repo, a marker-file repo, an excluded `node_modules` repo, and a repo below the depth bound
- [x] 1.2 Include the ancestor repository from `probeGit(browserRoot)` in the set when the root is inside a work tree; verify a fixture whose root is inside a repo and holds one nested repo yields both toplevels
- [x] 1.3 Implement longest-prefix resolution from a browser-root-relative path to a repository, returning "owned by none" rather than throwing; verify unit tests cover the nested-wins case, the ancestor-fallback case, and the unowned case
- [x] 1.4 `realpath`-resolve each candidate toplevel and reject any failing the file browser's `isWithin`/`resolveConfined` before it can enter the set; verify a fixture with a symlinked directory whose real repository lies outside the browser root leaves the set empty and spawns no git command
- [x] 1.5 Rewrite the `git.ts` header comment to state the confinement invariant in its new form (cwd = browser root or a confined repository toplevel, pathspec still bounding output); verify by reading it against the commands actually spawned

## 2. Workspace ownership

- [x] 2.1 Replace `WorkspaceResources.git: { toplevel } | null` with the repository set in `server/src/workspace.ts`, discovered when resources are built; verify existing workspace tests still pass and a new test asserts a non-repository root holding two repos produces a two-element set
- [x] 2.2 Derive `gitAvailable` from "the set is non-empty" rather than from a single probe; verify the snapshot carries `gitAvailable: true` for a non-repository root holding repositories, and `false` for a root holding none

## 3. Working-tree status across repositories

- [x] 3.1 Turn `gitStatus` into a per-repository fan-out with bounded concurrency, rebasing each entry's path from repository-relative to browser-root-relative; verify a two-repo fixture reports both modified files with browser-root-relative paths
- [x] 3.2 Report each repository's branch and ahead/behind counts alongside the files; verify the two-repo fixture reports two branches, and a single-repo fixture reports exactly one and issues exactly one git invocation
- [x] 3.3 Drop a parent's gitlink entry when its path is itself a repository in the set; verify a submodule fixture lists no duplicate path
- [x] 3.4 Scope the refresh triggered by a `file_changed` event to the repository owning the changed path; verify a two-repo fixture spawns one `git status`, not two, when one file changes

## 4. Protocol and repository-scoped requests

- [x] 4.1 Replace `git_status`'s flat `branch`/`ahead`/`behind` with a `repos: { root, branch, ahead, behind }[]` array in `shared/src/protocol.ts`; verify the package typechecks and no consumer still reads the removed fields
- [x] 4.2 Add a `repo` field to the `git_log` and `git_show` requests and resolve it against the workspace's set in `server/src/index.ts`; verify a log request naming the first repository returns none of the second's commits
- [x] 4.3 Fail `git_show` with a git error when the sha does not exist in the named repository, with no fallback to another; verify a test asserts the error and that no patch from either repository is returned
- [x] 4.4 Resolve the repository per path in the file-scoped handlers (`git_diff`, `git_file_log`, revision-pair diff) instead of reading a workspace-wide toplevel; verify diff and file history work for a file in a nested repository under a non-repository root

## 5. Freshness

- [x] 5.1 Re-scan the affected subtree, debounced, when a watcher event touches a `.git` marker; verify a test clones/inits a repository into a running workspace and observes its files gaining status without a restart
- [x] 5.2 Drop a toplevel from the set when it stops being a repository; verify no git command is spawned against the former toplevel afterwards

## 6. Interface

- [x] 6.1 Render tree badges from the merged multi-repository status, including change dots on collapsed ancestors across repositories; verify a component test over a two-repo status shows both badges and both directory dots
- [x] 6.2 Bind the branch chip to the repository owning the current selection, naming the repository alongside the branch when the set holds more than one; verify a component test selecting a file in each repository moves the chip to each branch in turn
- [x] 6.3 Implement the no-selection and unowned-selection rules — one repository names itself, several name no branch, an unowned selection leaves the chip where it was; verify component tests for the three cases
- [x] 6.4 Send the current selection's repository with the log and commit-patch requests opened from the chip; verify the chip's history lists only that repository's commits

## 7. Verification

- [x] 7.1 Build a server test fixture whose root is not a repository and whose children are, and assert the single-repository workspace behaves exactly as before it (the regression bar from design.md — Migration Plan); verify the pre-existing git test suite passes unchanged against the one-repository fixture
- [x] 7.2 Produce the scenario-to-test matrix over every `#### Scenario:` in the `git` and `multi-project-workspaces` deltas, listing test file and test name for each and classifying it covered/partial/uncovered; verify the list against `rg '^#### Scenario:' openspec/changes/resolve-git-per-repo-under-workspace/specs/`
- [x] 7.3 Drive the feature in the running widget per the bench workflow — rebuild `web`, then `@pi-outpost/embed`, then `build:e2e-host`, open a workspace whose root is not a repository, click a tracked leaf, and read back the DOM for badge, chip, diff toggle and history affordance; verify the observed DOM, not a screenshot
- [x] 7.4 Run `openspec validate resolve-git-per-repo-under-workspace --strict` and the server, shared and UI suites; verify all pass
