## MODIFIED Requirements

### Requirement: IsolateWorkspacesFromEachOther

Each workspace SHALL own its agent session, sandbox, browser and writable roots, git state, file watcher, toolset, session manager, work plan and code-intelligence runtime. A server message produced by one workspace SHALL reach only the clients subscribed to that workspace. A tool call in one workspace SHALL be confined to that workspace's sandbox.

A workspace's code-intelligence runtime SHALL analyse that workspace's working tree and no other, and SHALL share no index, cache or mutable analysis state with another workspace — including a workspace open on another git worktree of the same repository.

#### Scenario: EventsDoNotCrossWorkspaces
- **GIVEN** turns running concurrently in workspace A and workspace B
- **WHEN** each emits streaming events
- **THEN** a client subscribed to A receives only A's events

#### Scenario: SandboxIsPerWorkspace
- **GIVEN** workspace A rooted at one directory and workspace B at another
- **WHEN** an agent tool in A tries to read a file under B's root
- **THEN** the tool call fails, unless that path is within A's own sandbox

#### Scenario: CodeIntelligenceIsPerWorkspace
- **GIVEN** workspace A and workspace B open on two git worktrees of one repository
- **WHEN** each builds or updates its code-intelligence index
- **THEN** each index describes only its own working tree, and neither workspace reads or writes the other's analysis state

### Requirement: RetireIdleWorkspaces

A workspace with no client subscribed and no turn running MAY be stopped after a configured period of inactivity, releasing its watcher, session and code-intelligence runtime. A workspace SHALL NOT be stopped while a turn is running, however long it has run, and a stopped workspace SHALL be rebuilt transparently when it is next opened — its code intelligence included, started or resumed as part of that rebuild.

Releasing or suspending one workspace's code-intelligence resources SHALL leave every other workspace's running.

#### Scenario: WorkingWorkspacesAreNeverRetired
- **GIVEN** a workspace with no client subscribed whose agent has been streaming past the inactivity period
- **WHEN** the retirement sweep runs
- **THEN** the workspace is left running

#### Scenario: ReopeningARetiredWorkspace
- **GIVEN** a workspace stopped after inactivity
- **WHEN** a client opens it again
- **THEN** it is rebuilt and its session history is intact
- **AND** its code intelligence is started or resumed for it

#### Scenario: RetiringOneLeavesTheOthersAnalysing
- **GIVEN** three workspaces with code-intelligence runtimes, one of them idle past the inactivity period
- **WHEN** the retirement sweep stops the idle one
- **THEN** its analysis resources are released
- **AND** the other two keep theirs, indexing or ready as they were
