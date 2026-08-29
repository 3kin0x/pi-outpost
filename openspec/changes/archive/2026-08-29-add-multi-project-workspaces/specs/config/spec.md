## ADDED Requirements

### Requirement: PersistedOpenProjects

The set of open projects SHALL be persisted by the server the way editable runtime settings already are — written by the server when a project is opened or closed, not hand-authored in the configuration file. Each entry records the project's root directory and MAY record sandbox settings of its own; an entry without them inherits the server's. Persisting SHALL happen before the workspace is opened or stopped, so a set the user watched change is the set that survives a restart.

A configuration where nothing has ever been opened SHALL behave exactly as it does today, serving `cwd` alone.

#### Scenario: WritingFailsBeforeAnythingMoves
- **GIVEN** a persisted set that cannot be written
- **WHEN** the user opens a project
- **THEN** the request fails with an error and no workspace is created

#### Scenario: ProjectInheritsServerSandbox
- **GIVEN** an open project with no sandbox settings of its own
- **WHEN** its workspace is opened
- **THEN** it is sandboxed with the server's settings, rooted at that project's directory

#### Scenario: BackwardCompatibleConfiguration
- **GIVEN** an existing configuration file and no project ever opened
- **WHEN** the server starts
- **THEN** it serves one workspace rooted at `cwd`, as before

### Requirement: PinTheServerToOneProject

Configuration SHALL be able to forbid opening, closing and switching projects, binding the server to a single workspace. The setting follows the existing lock convention: when set, the server refuses those requests and clients offer no affordance for them. This is what an embedding host uses to bind its widget to one project.

#### Scenario: PinnedConfigurationRefusesSwitching
- **GIVEN** a configuration that pins the server to one project
- **WHEN** a client requests a different open project
- **THEN** the server refuses and the client's binding is unchanged

#### Scenario: PinnedConfigurationRefusesOpening
- **GIVEN** a configuration that pins the server to one project
- **WHEN** a client asks to open a directory as a new project
- **THEN** the server refuses and the persisted set is unchanged

### Requirement: WorkspaceIdleTimeout

Configuration SHALL be able to set how long an unused workspace stays alive before it is retired, and to disable retirement entirely. The setting SHALL have no effect on a workspace whose agent is running a turn. Retiring a workspace SHALL NOT remove it from the set of open projects — it stays listed and is rebuilt on next use.

#### Scenario: RetirementDisabled
- **GIVEN** a configuration disabling workspace retirement
- **WHEN** a workspace sits unused past any duration
- **THEN** it stays alive

#### Scenario: RetirementIsNotClosing
- **GIVEN** a workspace retired after inactivity
- **WHEN** a client connects
- **THEN** the project is still listed as open
