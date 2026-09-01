## ADDED Requirements

### Requirement: LocateTheGitExecutable

The system SHALL resolve the git executable before spawning it, rather than trusting the
process `PATH`. Resolution SHALL try, in order: the path named by configuration when there
is one; `git` as found on `PATH`; and the standard installation locations for the platform.
The first candidate that answers `git --version` SHALL be used for every git command of that
run.

A configured path that cannot be run SHALL fail resolution rather than falling through to
another candidate: an operator who names an executable is stating which one to use, and
silently running a different one would answer questions about the wrong installation.

Resolution SHALL happen once per server run, not once per command.

#### Scenario: GitOnThePath
- **GIVEN** a `PATH` containing a working git
- **WHEN** the system resolves the executable
- **THEN** that git is used

#### Scenario: GitInstalledButNotOnThePath
- **GIVEN** a machine where git is installed in the platform's standard location and absent from `PATH`
- **WHEN** the system resolves the executable
- **THEN** the installed git is found and used
- **AND** git features are available

#### Scenario: ConfiguredPathWins
- **GIVEN** a configuration naming a git executable, and a different git on `PATH`
- **WHEN** the system resolves the executable
- **THEN** the configured one is used

#### Scenario: ConfiguredPathThatCannotRun
- **GIVEN** a configuration naming a path that is not a runnable git
- **WHEN** the system resolves the executable
- **THEN** resolution fails, naming that path
- **AND** no other candidate is tried

#### Scenario: NoGitAnywhere
- **GIVEN** a machine with no git on `PATH` and none in any standard location
- **WHEN** the system resolves the executable
- **THEN** resolution fails, and git is reported unavailable because the executable could not be run

### Requirement: SayWhyGitIsUnavailable

When git is unavailable the system SHALL report which of three things is true, rather than
reporting only that it is: the executable could not be run, the workspace holds no
repository, or git ran and refused.

A workspace SHALL be counted as having git only when a repository it holds actually answers
git. Discovery reads the filesystem, which cannot tell a working repository from one git
declines to open, so a set found on disk SHALL be verified before the features that depend
on it are offered — otherwise every command fails where nobody is watching. Where git itself produced a message — "detected dubious
ownership" is the everyday case — that message SHALL be carried verbatim, because it names
the directory and the remedy.

The reason SHALL travel in the session snapshot beside `gitAvailable`, so a client learns it
without asking a question it has no reason to know to ask.

These are not equally interesting. A directory that holds no repository is the ordinary
state of a directory and SHALL be reported quietly. An executable that cannot be run, or a
repository git refuses, is a setup fault the user can fix and SHALL be surfaced where a user
looks when something is missing.

#### Scenario: NoExecutable
- **GIVEN** a machine where the git executable cannot be resolved
- **WHEN** a client connects
- **THEN** the snapshot says git is unavailable because the executable could not be run

#### Scenario: NoRepositoryHere
- **GIVEN** a workspace whose root holds no repository, on a machine with a working git
- **WHEN** a client connects
- **THEN** the snapshot says git is unavailable because there is no repository
- **AND** the reason is not raised as a fault to be fixed

#### Scenario: ARepositoryOnDiskGitWillNotRead
- **GIVEN** a workspace holding a directory the filesystem says is a repository, which git refuses to read
- **WHEN** a client connects
- **THEN** git is reported unavailable, because git refused
- **AND** the features are not offered as though they worked

#### Scenario: GitRefusesTheRepository
- **GIVEN** a repository git declines to read, as it does for dubious ownership
- **WHEN** a client connects
- **THEN** the snapshot says git is unavailable because git refused
- **AND** git's own message is carried with it

#### Scenario: TheFaultIsVisibleWhereAUserLooks
- **GIVEN** git reported unavailable because its executable could not be run
- **WHEN** the user opens the settings panel
- **THEN** it names git as unavailable, why, and what would fix it

#### Scenario: AnOrdinaryDirectoryIsNotAFault
- **GIVEN** git reported unavailable because the workspace holds no repository
- **WHEN** the user opens the settings panel
- **THEN** it states that plainly and offers nothing to fix

#### Scenario: TheReasonDoesNotOutliveItsCause
- **GIVEN** a workspace reported unavailable because it holds no repository
- **WHEN** a repository appears under it and the set is re-established
- **THEN** git is reported available and no reason is carried

## MODIFIED Requirements

### Requirement: DetectRepository

The system SHALL determine, when the workspace is built, which git repositories it holds
(the git executable resolvable and `rev-parse` succeeding): the repository containing the
file-browser root when there is one, and the repositories whose work tree lies under that
root. It SHALL advertise in the session snapshot (`gitAvailable`) whether the workspace
holds at least one repository, and hide all git features in the UI when it holds none.

`gitAvailable` describes the workspace, not any single file: a workspace whose root is not
itself in a repository but which holds repositories underneath SHALL advertise git as
available.

When `gitAvailable` is false the snapshot SHALL also carry why, as described in
SayWhyGitIsUnavailable. Hiding the features and saying nothing about them is what makes a
missing binary indistinguishable from a directory that was never a repository.

#### Scenario: InsideRepository
- **WHEN** the server starts with a browser root inside a git work tree
- **THEN** the snapshot carries gitAvailable: true and git requests are served

#### Scenario: NoRepository
- **WHEN** the browser root is not inside a git work tree, holds no repository underneath, or git is not installed
- **THEN** the snapshot carries gitAvailable: false, with the reason
- **AND** the UI renders no git affordances

#### Scenario: RepositoriesOnlyUnderneath
- **WHEN** the server starts with a browser root that is not inside a git work tree but holds repositories in its child directories
- **THEN** the snapshot carries gitAvailable: true and git requests are served
