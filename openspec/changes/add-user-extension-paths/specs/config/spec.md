## ADDED Requirements

### Requirement: UserExtensionPaths

Configuration SHALL hold extension paths added through the interface under a key of
their own, separate from the extension paths the configuration file declares. The
interface's key is a record of what a user did; the declared paths are the
deployment's, and the two SHALL NOT be merged into one editable list.

A configured extension path MAY be a directory. The agent runtime discovers the
extensions inside it, so the interface needs no way to name an individual file.

#### Scenario: TheTwoListsLoadTogether
- **GIVEN** a configuration file declaring extension paths and a user extension path added through the interface
- **WHEN** the server starts
- **THEN** extensions from both are loaded

#### Scenario: ADirectoryIsAValidExtensionPath
- **GIVEN** a user extension path pointing at a directory containing extensions
- **WHEN** the server starts
- **THEN** the extensions discovered inside that directory are loaded

#### Scenario: BothListsAreReadExceptionsToTheSandbox
- **GIVEN** a sandbox whose root does not contain the user's extension directory
- **WHEN** the configuration is loaded
- **THEN** that directory is a read exception, as declared extension paths already are

### Requirement: ExtensionLock

Configuration SHALL be able to forbid interface-driven changes to extension paths. The
setting follows the existing lock convention: when set, the server refuses those
requests and clients offer no affordance for them.

Loading code is not the same act as pointing the agent at more text to read, so this
lock is independent of any sandbox lock and of the skill paths, which stay editable
under it.

#### Scenario: ALockedServerRefusesTheChange
- **GIVEN** a configuration that locks extension paths
- **WHEN** a client requests a settings update that adds or removes one
- **THEN** the server refuses it and the configuration file is unchanged

#### Scenario: TheLockIsReportedToClients
- **GIVEN** a configuration that locks extension paths
- **WHEN** a client connects
- **THEN** the snapshot says extension paths are locked, so the interface can offer no control for them

#### Scenario: TheLockLeavesSkillPathsAlone
- **GIVEN** a configuration that locks extension paths and does not lock anything else
- **WHEN** the user adds a skill path and applies settings
- **THEN** the skill path is accepted and persisted
