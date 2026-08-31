## Purpose

Structural analysis of the project a workspace is open on — who calls what, what a change
reaches, which tests cover it, what was decided before — owned by that workspace and answered
from its own working tree, so that an answer given in one project is never computed from
another's source.

## ADDED Requirements

### Requirement: AWorkspaceOwnsItsCodeIntelligence

Every workspace SHALL own an independent code-intelligence runtime bound to the working tree
at its own root. No index, cache, watcher or other mutable analysis state SHALL be implicitly
shared between two workspaces.

Four identities SHALL remain distinct, and the system SHALL NOT collapse any of them into
another:

- the **repository** — the logical source repository;
- the **working tree** — the concrete filesystem snapshot analysed, a git worktree included;
- the **workspace** — the pi-outpost runtime and session open on that working tree;
- the **analysis instance** — the runtime and index representing that working tree.

Two workspaces open on two worktrees of one repository SHALL therefore hold two analysis
instances with two indexes, because their source snapshots differ, and an answer from one is
not an answer about the other.

#### Scenario: TwoWorktreesOfOneRepositoryDoNotShareAnIndex
- **GIVEN** two workspaces open on two git worktrees of the same repository, on different branches
- **WHEN** a structural question is asked in each
- **THEN** each answer is computed from that workspace's own working tree
- **AND** neither workspace's index, cache or analysis state is the other's

#### Scenario: AnalysisStaysInsideItsOwnWorkspace
- **GIVEN** workspace A and workspace B open on unrelated directories
- **WHEN** the agent in A asks a structural question
- **THEN** the answer describes A's working tree only, and names no file under B's root

#### Scenario: EachInstanceIsAddressedByItsWorkingTree
- **GIVEN** several workspaces with code intelligence running
- **WHEN** a workspace's analysis instance is identified for supervision, health or diagnostics
- **THEN** it is identified by its working tree, not by its repository, so two worktrees of one repository are two instances

### Requirement: OfferedWhereItCanServe

Code intelligence SHALL be offered for a workspace whose project can be analysed, and SHALL
NOT be a condition of opening a workspace. A project it cannot serve SHALL work exactly as it
does without it: the workspace opens, its agent runs, and the capability reports itself
unavailable with a reason rather than degrading anything else.

Configuration SHALL be able to disable the capability outright, and a disabled capability
SHALL start nothing and cost nothing.

#### Scenario: AProjectItCannotServeStillOpens
- **GIVEN** a directory the analysis runtime cannot index
- **WHEN** it is opened as a workspace
- **THEN** the workspace opens and its agent works
- **AND** the capability is reported unavailable, with a reason, for that workspace only

#### Scenario: TheAnalysisRuntimeIsNotInstalled
- **GIVEN** an installation where the analysis runtime is not present
- **WHEN** a workspace is opened
- **THEN** the workspace opens and its agent works
- **AND** the capability is reported unavailable with a reason a person can act on

#### Scenario: DisabledMeansNothingStarts
- **GIVEN** a configuration that disables code intelligence
- **WHEN** a workspace is opened
- **THEN** no analysis runtime is started for it, no index is written, and the agent is offered no structural tools

### Requirement: StructuralToolsReachTheAgentNatively

A workspace's structural capabilities SHALL reach its agent as tools of that agent's own
runtime, through the extension surface both supported agent runtimes already have. The
integration SHALL NOT require, configure, or document a Model Context Protocol server, and a
user SHALL never have to install or wire one for these tools to exist.

The tools SHALL preserve the analysis runtime's own semantics — its operations, arguments and
results — rather than being renamed, re-shaped or reimplemented on the way through. Every
detail specific to that runtime SHALL stay behind one adapter, so no other part of pi-outpost
depends on it directly.

Where the analysis runtime declares skills alongside its tools, those SHALL reach the agent
too, under the server's existing skill policy: a skill the user supplies under the same name
SHALL win, and a configuration that withholds bundled skills SHALL withhold these as well.

#### Scenario: TheToolsArePresentWithNoMcpAnywhere
- **GIVEN** a workspace whose code intelligence is ready and no MCP server configured or running
- **WHEN** the agent lists its tools
- **THEN** the structural tools are among them

#### Scenario: BothRuntimesOfferTheSameTools
- **GIVEN** the same project opened under each supported agent runtime in turn
- **WHEN** the agent lists its tools
- **THEN** the same structural tools are present in both, answering about the same working tree

#### Scenario: TheSkillsTravelWithTheTools
- **GIVEN** a workspace whose code intelligence is ready
- **WHEN** the agent lists its skills
- **THEN** the analysis runtime's own skills are among them
- **AND** under a configuration that withholds bundled skills, they are absent along with the rest

### Requirement: TheServerIndexesAndNothingMore

pi-outpost's own use of the analysis runtime SHALL be limited to establishing and maintaining
the index for a workspace's working tree, and to asking after its health. The server SHALL NOT
initiate spec generation, spec repair, verification, drift analysis or any other operation that
drives a language model or writes documents into the project.

Those operations belong to the agent, through the skills and tools it has been given, when the
user asks for them. The capability SHALL therefore NOT depend on the analysis runtime having a
model provider configured: a project with no such configuration SHALL still index, still answer
structural questions, and still reach ready.

#### Scenario: NoProviderIsNeededToBeReady
- **GIVEN** a project whose analysis runtime has no model provider configured
- **WHEN** its workspace is opened
- **THEN** the capability indexes and reaches ready
- **AND** the structural tools answer

#### Scenario: TheServerWritesNoSpecs
- **GIVEN** a workspace whose code intelligence is ready
- **WHEN** the workspace is opened, indexed, reconciled and closed with no request from the user
- **THEN** no specification, decision record or other document has been written into the project by the server
- **AND** no model provider has been called on its behalf

#### Scenario: TheAgentStillMay
- **GIVEN** a user who asks the agent to generate or repair specifications
- **WHEN** the agent uses the skills and tools it has
- **THEN** nothing in this capability prevents it

### Requirement: ASnapshotTransitionIsReconciledBeforeReady

A branch or HEAD change inside a workspace's working tree SHALL be treated as that tree
becoming a different snapshot, not as an ordinary file modification. On detecting one, the
workspace SHALL drive its analysis instance to reconcile its index with the resulting working
tree, and SHALL NOT report the capability ready until the reconciliation completes.

While reconciling, the capability SHALL be reported as reconciling to the client and to the
agent. Results computed before the transition SHALL NOT be presented as current without that
state being exposed alongside them.

#### Scenario: SwitchingBranchesLeavesTheIndexReconciling
- **GIVEN** a workspace whose code intelligence is ready
- **WHEN** the branch checked out in its working tree changes
- **THEN** the capability moves to reconciling
- **AND** it returns to ready only once the index represents the new working tree

#### Scenario: StaleAnswersAreNotPassedOffAsCurrent
- **GIVEN** a workspace reconciling after a branch change
- **WHEN** the agent invokes a structural tool
- **THEN** it is told the capability is reconciling, rather than being handed a result computed from the previous snapshot as though it were current

#### Scenario: AnOrdinaryEditIsNotASnapshotTransition
- **GIVEN** a workspace whose code intelligence is ready
- **WHEN** a file in the working tree is edited
- **THEN** the capability is not driven through a snapshot reconciliation, and incremental freshness is left to the analysis runtime

### Requirement: SupervisedPerWorkspaceWithABoundedRestart

pi-outpost SHALL supervise each workspace's analysis instance independently, and SHALL
distinguish at least these states: starting; indexing or reconciling; ready; degraded;
unavailable or failed; recovering or restarting.

Where technically practical the analysis SHALL run behind a runtime boundary that lets it
fail or restart without terminating pi-outpost or any other workspace. Recovering or
restarting one workspace's instance SHALL NOT stop, restart or disturb another's.

Where a workspace's working tree is already served by an analysis instance belonging to another
process, pi-outpost SHALL adopt that instance rather than contend for it: it SHALL NOT start a
competing instance, SHALL report the capability from what it can observe, and SHALL NOT report it
failed merely because it did not start what it is using. Releasing an adopted instance SHALL
detach from it and SHALL NOT stop it — a workspace closing must not take an analysis instance away
from whatever else is using that working tree.

pi-outpost SHALL know, for each workspace, whether it owns the instance it is using; the
supervision obligations of this requirement — restart, recovery, teardown — apply to an instance
it owns and to no other.

Repeated failures SHALL NOT produce an uncontrolled restart loop: attempts SHALL be bounded,
after which the capability SHALL rest in a failed state that says so rather than retrying
forever. A failure SHALL retain enough diagnostic information — the runtime error, and the
runtime's own output where it has any — to say afterwards what happened.

#### Scenario: OneInstanceCrashesAndTheServerDoesNot
- **GIVEN** three workspaces with code intelligence ready
- **WHEN** the analysis instance of one dies unexpectedly
- **THEN** pi-outpost keeps running, the other two workspaces keep their capability
- **AND** the affected workspace reports recovering, then either ready or failed

#### Scenario: RepeatedFailuresStopRetrying
- **GIVEN** an analysis instance that fails immediately every time it is started
- **WHEN** the supervisor has made its bounded number of attempts
- **THEN** it stops attempting, reports the capability failed, and says why
- **AND** it does not keep spawning processes

#### Scenario: TheFailureCanBeExplainedAfterwards
- **GIVEN** an analysis instance that failed unexpectedly
- **WHEN** diagnostics are requested for that workspace
- **THEN** the retained runtime error and output for that failure are available

#### Scenario: AnotherProcessAlreadyServesThisTree
- **GIVEN** a working tree already served by an analysis instance another process started
- **WHEN** a workspace is opened on it
- **THEN** pi-outpost adopts it rather than starting a competing instance
- **AND** the capability is reported from what can be observed, not as failed

#### Scenario: ReleasingAnAdoptedInstanceLeavesItRunning
- **GIVEN** a workspace using an analysis instance it did not start
- **WHEN** that workspace is closed or retired
- **THEN** pi-outpost detaches from the instance
- **AND** the instance keeps running for whatever else is using that working tree

#### Scenario: NoSilentLossOfTheCapability
- **GIVEN** a workspace whose code intelligence was ready
- **WHEN** its analysis instance becomes unusable
- **THEN** the capability's state changes to say so, for that workspace, rather than the tools quietly ceasing to work

### Requirement: ReadinessIsProvedFunctionally

The existence of a process SHALL NOT be treated as evidence that code intelligence is
operational. Readiness SHALL be established from the analysis runtime's own answers, and
where that runtime distinguishes them, pi-outpost SHALL distinguish:

- whether the runtime is available at all;
- whether its programmatic surface answers;
- whether the index is present, complete and readable;
- whether its watching or synchronisation is healthy;
- whether a background reconciliation or repair is in progress.

A live process whose index is absent, stale or unreadable SHALL be reported as degraded or
reconciling, never as ready. pi-outpost SHALL rely on the analysis runtime's own integrity and
repair mechanisms, and SHALL NOT implement a second set of its own; where that runtime
exposes a lightweight health capability, supervision SHALL use it.

#### Scenario: AliveButNotReady
- **GIVEN** an analysis instance whose process is running and whose index is not yet built
- **WHEN** the capability's state is reported
- **THEN** it is indexing or degraded, not ready

#### Scenario: TheHealthAnswerIsTheRuntimesOwn
- **WHEN** pi-outpost decides whether a workspace's code intelligence is ready
- **THEN** it asks the analysis runtime and uses that answer
- **AND** it does not verify or repair the index by inspecting it itself

#### Scenario: ADamagedIndexIsNotReportedReady
- **GIVEN** an analysis instance whose index the runtime reports as damaged or being repaired
- **WHEN** the capability's state is reported
- **THEN** it is degraded or reconciling, and the reason is available

### Requirement: TheAgentIsToldWhatItCanUse

When a workspace's code intelligence is unavailable, reconciling, degraded, or otherwise
unable to answer in a way that can be trusted, its agent SHALL receive an explicit signal
saying so. It SHALL NOT be left to discover the state by invoking a tool and reading a
failure, and SHALL NOT be induced to invoke unavailable operations repeatedly.

When the capability becomes ready again, the agent SHALL be able to use it again without the
workspace being rebuilt and without the session being recreated.

#### Scenario: TheAgentLearnsTheCapabilityIsDown
- **GIVEN** a workspace whose analysis instance has failed
- **WHEN** its agent takes a turn
- **THEN** it is told the structural capability is unavailable, and why, before it calls anything

#### Scenario: NoRepeatedCallsIntoADeadCapability
- **GIVEN** an agent that has been told the capability is unavailable
- **WHEN** it continues the turn
- **THEN** it does not keep invoking the unavailable operations

#### Scenario: ItResumesWithoutARestart
- **GIVEN** a session that ran while the capability was unavailable
- **WHEN** the capability returns to ready
- **THEN** the same session may use the structural tools again, with no new workspace and no new session

### Requirement: LifecycleFollowsTheWorkspace

Code intelligence SHALL be scoped to the workspace rather than to the server. Opening a
workspace SHALL make its capability available or begin its initialisation. Switching the
client's visible workspace SHALL NOT stop, pause or restart the analysis of any other
workspace. Closing, removing or archiving a workspace, and retiring an idle one, SHALL
release or suspend its analysis resources and SHALL leave every other workspace's untouched.

Indexing, health, recovery and diagnostics SHALL therefore be reported and acted on per
workspace, never once for the server.

#### Scenario: IndexingContinuesInTheWorkspaceLeftBehind
- **GIVEN** workspace A indexing and a client viewing it
- **WHEN** the client switches to workspace B
- **THEN** A's indexing continues to completion
- **AND** its result is there when the client returns

#### Scenario: ClosingReleasesOnlyItsOwn
- **GIVEN** three workspaces with analysis instances running
- **WHEN** one of them is closed
- **THEN** its analysis resources are released
- **AND** the other two instances keep running, unaffected

#### Scenario: ARetiredWorkspaceComesBackWithItsCapability
- **GIVEN** a workspace stopped after inactivity
- **WHEN** a client opens it again
- **THEN** its code intelligence is started or resumed for it, without the other workspaces being disturbed

### Requirement: FederationIsStructuralKnowledgeNotAccess

The analysis runtime's own federation — its registry of peer repositories and the
cross-repository answers it draws from their independently built indexes — SHALL be preserved
and SHALL remain available to the agent through the same native tools. pi-outpost SHALL NOT
implement a second cross-repository analysis mechanism, a registry of its own, or its own
federation graph, traversal or conflict detection.

Federation SHALL NOT widen pi-outpost's workspace isolation. In particular it SHALL NOT
grant, implicitly or otherwise:

- filesystem access to another workspace;
- write access to another repository;
- command execution in another workspace;
- access to another workspace's session or conversation.

A federated answer is knowledge about a peer repository's structure, and nothing else the
agent may act through.

Peers SHALL be mapped by repository identity. Several workspaces representing different
worktrees of one logical repository SHALL remain independent analysis instances and SHALL NOT
be registered as separate federation peers merely because they are separate workspaces, and
SHALL NOT be federated with one another automatically.

Where the analysis runtime exposes cross-repository impact, dependency, path, test-selection
or in-flight conflict information, it SHALL remain reachable by the agent of the workspace
whose analysis produced it.

#### Scenario: ACrossRepositoryAnswerIsStillAvailable
- **GIVEN** a workspace whose project registers a peer repository with the analysis runtime
- **WHEN** the agent asks a question whose scope includes that peer
- **THEN** it receives the runtime's federated answer, including which peers were consulted and which were skipped

#### Scenario: FederationGrantsNoReachIntoAnotherWorkspace
- **GIVEN** a federated peer that is also open as another pi-outpost workspace
- **WHEN** the agent tries to read, write, or run a command under that peer's root through any tool
- **THEN** it is refused exactly as it would be without federation, and the peer's session and conversation remain unreachable

#### Scenario: TwoWorktreesAreNotMadePeers
- **GIVEN** two workspaces open on two worktrees of one repository
- **WHEN** their analysis instances start
- **THEN** neither is registered as a federation peer of the other, and no cross-worktree federation is created on their behalf

#### Scenario: TheRegistryStaysTheRuntimes
- **WHEN** a peer repository is registered, refreshed or removed
- **THEN** it is the analysis runtime's own registry and semantics that record it, and pi-outpost keeps no second copy of that relationship

### Requirement: TheInterfaceSaysWhereEachWorkspaceStands

The interface SHALL expose each workspace's code-intelligence state without requiring the
user to understand the analysis runtime's internal architecture: what it says SHALL be the
state of the capability for that project.

A long-running operation — a first index, a reconciliation, a repair — SHALL show determinate
progress where the analysis runtime supplies progress that means something, and SHALL
otherwise say it is working without inventing a proportion.

A failure in a workspace the user is not looking at, when it needs their attention, SHALL be
raised through pi-outpost's existing multi-workspace attention model rather than a mechanism
of its own, and SHALL NOT interrupt the workspace being viewed.

Detailed diagnostics SHALL be available on demand for a workspace. Runtime detail SHALL NOT
occupy the primary workspace interface permanently.

#### Scenario: TheStateIsVisiblePerProject
- **GIVEN** three open projects, one ready, one indexing and one failed
- **WHEN** the user looks at the workspace control
- **THEN** each project's code-intelligence state is legible there, without switching to it

#### Scenario: ProgressWhereThereIsProgress
- **GIVEN** a first index that reports how far it has got
- **WHEN** it runs
- **THEN** the interface shows determinate progress for that workspace
- **AND** where no meaningful progress is reported, it says the work is under way rather than showing a fabricated proportion

#### Scenario: ABackgroundFailureDoesNotInterrupt
- **GIVEN** a client viewing workspace A
- **WHEN** workspace B's code intelligence fails in a way that needs the user
- **THEN** B is raised through the existing attention model
- **AND** no dialog opens over A and the focus does not change

#### Scenario: DiagnosticsOnDemandOnly
- **WHEN** a workspace's code intelligence is ready
- **THEN** the primary interface carries no permanent runtime detail for it
- **AND** the detail is reachable on demand when the user asks for it
