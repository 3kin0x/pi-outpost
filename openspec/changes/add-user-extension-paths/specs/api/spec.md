## ADDED Requirements

### Requirement: TheSnapshotCarriesEditableExtensionPaths

The state snapshot SHALL carry the extension paths added through the interface and
whether extension paths are locked, so a client can draw the controls it is allowed to
draw and no others. `update_config` SHALL accept those paths in the same message that
carries sandbox and skill changes, and SHALL treat them by the same rules: an empty
list is a removal, and paths resolve against the configuration file's own directory.

The snapshot's inventory of loaded extension files SHALL be distinguishable from a
runtime that cannot report one. A runtime that builds no extensions of its own — an
RPC child builds its own — SHALL be reported as unable to say, not as having none: an
empty list read as a fact tells the operator something untrue.

#### Scenario: TheSnapshotNamesTheUsersOwnPaths
- **GIVEN** a server with an extension path added through the interface
- **WHEN** a client connects
- **THEN** the snapshot lists that path apart from the configuration file's own

#### Scenario: ALockedServerSaysSo
- **GIVEN** a configuration that locks extension paths
- **WHEN** a client connects
- **THEN** the snapshot reports the lock

#### Scenario: AnAppliedChangeComesBackInTheAcknowledgement
- **WHEN** a client sends `update_config` carrying extension paths and the server accepts it
- **THEN** the acknowledgement carries the snapshot the change produced, including the new paths

#### Scenario: AnUnknowableInventoryIsNotReportedAsEmpty
- **GIVEN** a server whose conversation is served by a supervised agent child
- **WHEN** a client connects
- **THEN** the snapshot marks the loaded-extension inventory as unavailable rather than listing none
