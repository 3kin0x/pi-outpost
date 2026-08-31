## ADDED Requirements

### Requirement: CodeIntelligenceStateOnTheWire

The state snapshot SHALL carry, for every open project it lists, that project's
code-intelligence state, and the server SHALL send an update to every connection whenever a
project's state changes — including projects the connection is not bound to, so a client can
show a background project's indexing or failure without subscribing to it.

The state SHALL distinguish at least: not applicable or disabled, starting, indexing,
reconciling, ready, degraded, failed, and recovering. Where the analysis runtime supplies
meaningful progress for a long-running operation, the message SHALL carry it; where it does
not, the message SHALL carry no progress rather than a value the server invented. A degraded,
failed or unavailable state SHALL carry a reason a person can read.

Detailed diagnostics for a project SHALL be obtainable on request, scoped to the workspace the
connection is bound to, and SHALL NOT be pushed with every state change.

A code-intelligence state message SHALL carry no content of the project it describes: no
source, no analysis result, and nothing from another workspace's session or conversation.

#### Scenario: TheSnapshotCarriesEveryProjectsState
- **GIVEN** a server with three open projects
- **WHEN** a client connects
- **THEN** the snapshot names each project's code-intelligence state alongside its activity state

#### Scenario: BackgroundIndexingIsVisible
- **GIVEN** a client bound to workspace A
- **WHEN** workspace B starts indexing and later becomes ready
- **THEN** the client receives both state changes for B
- **AND** it receives none of B's analysis results or conversation

#### Scenario: ProgressOnlyWhenItIsReal
- **GIVEN** a workspace whose analysis runtime reports how far its first index has got
- **WHEN** the state is sent
- **THEN** it carries that progress
- **AND** for a runtime that reports no such progress, the message carries none rather than a fabricated one

#### Scenario: AFailureSaysWhy
- **GIVEN** a workspace whose code intelligence has failed
- **WHEN** its state reaches the client
- **THEN** it carries a readable reason

#### Scenario: DiagnosticsAreAskedFor
- **GIVEN** a connection bound to a workspace whose code intelligence failed
- **WHEN** it requests the diagnostics for that workspace
- **THEN** the retained error and runtime output are returned
- **AND** a request for another workspace's diagnostics is refused
