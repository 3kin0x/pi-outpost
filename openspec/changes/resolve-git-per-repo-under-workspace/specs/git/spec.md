## ADDED Requirements

### Requirement: ResolveTheRepositoryOwningAPath

The system SHALL own, per workspace, a set of git repositories: the repositories whose
work tree lies under the browser root, together with the repository containing the browser
root when the root is itself inside one. Every git request naming a path SHALL be served by
the repository in that set whose toplevel is the longest prefix of the path; a path owned by
no repository in the set SHALL be treated as untracked — no badge, no diff, no history — and
SHALL NOT fail the request that carried it alongside tracked paths.

Discovery SHALL be bounded so that a large workspace does not stall the server: it SHALL NOT
descend into a repository's work tree looking for further repositories, and SHALL NOT
descend into directories the file browser already excludes. A repository marker that is a
file rather than a directory — as a linked work tree and a submodule both have — SHALL be
recognised as a repository wherever discovery reaches it.

These two rules settle the submodule between them: a submodule of a repository the workspace
already holds is inside that repository's work tree, so discovery stops before it and its
parent answers for its files. A repository nested under the browser root but outside every
repository in the set — an embedded clone, or a submodule of a repository whose toplevel is
an ancestor of the root — is found and answers for itself; the containing repository reports
it as a single entry, and the set SHALL NOT report that entry as a file of its own.

#### Scenario: NestedRepositoriesUnderANonRepositoryRoot
- **GIVEN** a browser root that is not inside a git work tree, holding three child directories that are each a repository
- **WHEN** a client requests the working-tree status
- **THEN** files from all three repositories are reported

#### Scenario: TheLongestPrefixWins
- **GIVEN** a browser root inside a repository, holding a child directory that is its own repository
- **WHEN** a file inside that child directory is asked about
- **THEN** the child repository answers, not the ancestor one

#### Scenario: AFileOwnedByNoRepository
- **GIVEN** a workspace holding one repository and a loose file outside it
- **WHEN** that loose file is opened
- **THEN** no diff toggle and no history affordance are offered for it
- **AND** the status request that listed its siblings still succeeds

#### Scenario: ARepositoryMarkerThatIsAFile
- **GIVEN** a child directory whose repository marker is a file, as a linked work tree and a submodule both have
- **WHEN** the workspace discovers its repositories
- **THEN** that directory is one of them

#### Scenario: ARepositoryInsideAWorkTreeIsLeftToItsParent
- **GIVEN** a browser root that is itself a repository, holding a submodule
- **WHEN** the workspace discovers its repositories
- **THEN** it holds one repository, and the submodule's files are answered by it

#### Scenario: AnEmbeddedRepositoryIsNotAlsoAFile
- **GIVEN** a browser root inside a repository, holding a child directory that is its own repository
- **WHEN** the working-tree status is reported
- **THEN** the child's own files carry their status
- **AND** the containing repository's single entry for that child is not reported as a file

### Requirement: RepositorySetFreshness

The repository set SHALL be re-established when a repository appears under the browser root
or stops being one during the life of the workspace, so that a repository cloned or
initialised while the server runs becomes usable without restarting it, and a removed one
stops being consulted.

#### Scenario: ARepositoryClonedWhileRunning
- **GIVEN** a running workspace whose repositories have already been discovered
- **WHEN** a new repository appears under the browser root
- **THEN** its files carry status badges and its history is available, without a restart

#### Scenario: ARepositoryThatStopsBeingOne
- **GIVEN** a workspace holding two repositories
- **WHEN** one of them ceases to be a repository
- **THEN** its files are reported as owned by no repository
- **AND** no git command is spawned against its former toplevel

## MODIFIED Requirements

### Requirement: DetectRepository

The system SHALL determine, when the workspace is built, which git repositories it holds
(system `git` binary present and `rev-parse` succeeding): the repository containing the
file-browser root when there is one, and the repositories whose work tree lies under that
root. It SHALL advertise in the session snapshot (`gitAvailable`) whether the workspace
holds at least one repository, and hide all git features in the UI when it holds none.

`gitAvailable` describes the workspace, not any single file: a workspace whose root is not
itself in a repository but which holds repositories underneath SHALL advertise git as
available.

#### Scenario: InsideRepository
- **WHEN** the server starts with a browser root inside a git work tree
- **THEN** the snapshot carries gitAvailable: true and git requests are served

#### Scenario: NoRepository
- **WHEN** the browser root is not inside a git work tree, holds no repository underneath, or git is not installed
- **THEN** the snapshot carries gitAvailable: false
- **AND** the UI renders no git affordances

#### Scenario: RepositoriesOnlyUnderneath
- **WHEN** the server starts with a browser root that is not inside a git work tree but holds repositories in its child directories
- **THEN** the snapshot carries gitAvailable: true and git requests are served

### Requirement: ConfinedGitCommands

The system SHALL run only read-only git commands (`rev-parse`, `status`, `log`, `show`),
spawned without a shell with fixed argument lists, `cwd` at the browser root or at the
toplevel of a repository in the workspace's repository set, and a pathspec that is either
`-- .` (repo-scoped requests) or the single confined file being asked about (file-scoped
requests), so git itself reports nothing outside the browser root, with a timeout and output
cap. A repository toplevel SHALL become a `cwd` only after passing the same confinement
check the file browser uses, so a repository discovered outside the browser root is never
consulted. Single-file operations MUST validate the path with the same confinement used by
the file browser; commit ids MUST match `/^[0-9a-f]{7,40}$/i`, and a revision naming the
working tree MUST be an exact literal marker, never passed to git as a revision. A path MUST
NOT be interpretable as an option or a revision by git: file-scoped commands MUST separate
paths from revisions with `--`.

#### Scenario: RepoLargerThanRoot
- **WHEN** the repository toplevel is an ancestor of the browser root and git_status is requested
- **THEN** Only entries under the browser root are reported

#### Scenario: PathEscapeRefused
- **WHEN** git_diff is requested for a path resolving outside the browser root
- **THEN** The request fails with a git_error and no git command runs on that path

#### Scenario: MalformedSha
- **WHEN** git_show is requested with a sha not matching the commit-id pattern
- **THEN** The request fails with a git_error and no git command is spawned

#### Scenario: PathLookingLikeOption
- **WHEN** a file-scoped git request is made for a confined path beginning with a dash
- **THEN** git treats it as a path, not as an option, and the request either succeeds or fails as a path

#### Scenario: RepositoryRootOutsideTheBrowserRootIsNeverACwd
- **WHEN** a candidate repository toplevel resolves outside the browser root
- **THEN** it is excluded from the repository set and no git command is spawned with it as cwd

### Requirement: WorkingTreeStatus

The system SHALL report per-file status (modified, added, deleted, untracked, conflicted)
for files under the browser root across every repository in the workspace's repository set,
each file identified by its path relative to the browser root. Alongside the files, the
system SHALL report, for each repository in the set, its current branch and its ahead/behind
counts when a remote is tracked, so that a client can name the branch of any file it has
without a further request.

File status SHALL be gathered from one `git status --porcelain=v2 --branch` invocation per
repository. A workspace holding one repository SHALL therefore behave exactly as before.

#### Scenario: StatusReported
- **WHEN** git_status is requested in a repo with a modified and an untracked file
- **THEN** The response lists both files with their status and the current branch

#### Scenario: StatusSpansRepositories
- **GIVEN** a workspace holding two repositories, each with a modified file
- **WHEN** git_status is requested
- **THEN** both files are listed, each with a path relative to the browser root
- **AND** both repositories are reported with their own branch and ahead/behind counts

#### Scenario: StatusRefresh
- **WHEN** a file_changed broadcast or agent_end event occurs
- **THEN** The client refetches git_status (coalescing concurrent refetches)
- **AND** tree badges and the header branch reflect the new state

### Requirement: CommitHistory

The system SHALL list recent commits (id, author, ISO date, subject; limit clamped to
[1, 100]) and return a given commit's unified patch, capped in size with an explicit
truncation flag. Both SHALL be scoped to one repository of the workspace's repository set —
the repository owning the path the request names — and, within it, to the browser root.

A commit id SHALL be interpreted only against the repository the request names a path for;
a request naming a path owned by no repository SHALL fail with a git error rather than
falling back to another repository.

#### Scenario: LogListed
- **WHEN** git_log is requested with limit 20
- **THEN** Up to 20 commits touching the browser root are returned, newest first

#### Scenario: LogIsScopedToTheNamedRepository
- **GIVEN** a workspace holding two repositories with unrelated histories
- **WHEN** the log is requested for a path inside the first
- **THEN** only the first repository's commits are returned

#### Scenario: CommitDiffShown
- **WHEN** git_show is requested for a listed commit
- **THEN** Its patch (scoped to the browser root) is returned and rendered as a diff

#### Scenario: OversizedPatchTruncated
- **WHEN** a commit's patch exceeds the size cap
- **THEN** The patch is truncated and flagged truncated: true instead of failing

#### Scenario: CommitIdFromAnotherRepository
- **GIVEN** a commit id that exists only in the second repository
- **WHEN** its patch is requested against the first
- **THEN** the request fails with a git_error and no patch from either repository is returned

### Requirement: GitUISurface

The frontend SHALL show a branch chip in the header when git is available, mark files
carrying a status with a colored badge in the file tree (and a dot on collapsed ancestor
directories) whichever repository they belong to, offer a worktree diff toggle in the viewer
for files with changes, offer a history affordance in the viewer for any tracked file — not
only changed ones — that opens the file-history graph, and open commit history from the
branch chip (click a commit → its patch full-pane).

The branch chip SHALL name the repository owning what the user last touched in the file
tree — a file or a directory — with that repository's branch and ahead/behind counts, and
the commit history opened from it SHALL be that repository's. Touching anything in another
repository SHALL move the chip to that repository without any picker control: walking into a
project's directory says which project the user is in as surely as opening one of its files,
and SHALL move the chip as surely.

When nothing has been touched, the chip SHALL name the workspace's only repository if it has
exactly one, and SHALL otherwise name no branch while remaining visible. A selection owned by
no repository SHALL likewise name no branch, rather than continuing to name the last
repository it knew — in a directory of projects the loose files at the root are exactly where
a README lives, and a chip naming a project the user has left is worse than one admitting it
has none. A file owned by no repository SHALL additionally offer neither diff toggle nor
history affordance.

#### Scenario: BranchChipVisible
- **WHEN** the app connects to a server with gitAvailable: true
- **THEN** The header shows the current branch chip

#### Scenario: TreeBadges
- **WHEN** the status lists a modified file inside an expanded directory
- **THEN** The file row shows an "M" badge and collapsed ancestors show a change dot

#### Scenario: BadgesSpanRepositories
- **GIVEN** a workspace whose root is not a repository and whose two child directories are
- **WHEN** each holds a modified file and the tree is expanded to show them
- **THEN** both rows carry their badge, and each child directory shows a change dot when collapsed

#### Scenario: TheChipFollowsTheSelection
- **GIVEN** a workspace holding two repositories on different branches
- **WHEN** the user selects a file in the first and then a file in the second
- **THEN** the chip names the first repository's branch, then the second's

#### Scenario: TheChipFollowsADirectoryToo
- **GIVEN** a workspace holding two repositories, with the chip naming the first
- **WHEN** the user clicks the second repository's directory in the tree, opening no file
- **THEN** the chip names the second repository's branch

#### Scenario: ASelectionUnderNoRepositoryNamesNothing
- **GIVEN** a workspace holding two repositories, with the chip naming one of them
- **WHEN** the user selects a file that lies under no repository
- **THEN** the chip remains on screen and names no branch

#### Scenario: FullGitSurfaceOnClickingATrackedLeaf
- **GIVEN** a workspace whose root is not a repository, holding a repository with a modified tracked file
- **WHEN** the user clicks that file in the tree
- **THEN** the chip names its repository's branch, the viewer offers its worktree diff and its history affordance, and the chip's commit history lists that repository's commits

#### Scenario: NoSelectionInAMultiRepositoryWorkspace
- **GIVEN** a workspace holding two repositories and no file selected
- **THEN** the chip is shown and names no branch

#### Scenario: ViewerDiffToggle
- **WHEN** a file present in the git status is open in the viewer
- **THEN** A "diff" toggle shows its before/after against HEAD

#### Scenario: ViewerHistoryAffordance
- **WHEN** an unmodified tracked file is open in the viewer
- **THEN** no diff toggle is offered but the history affordance is
