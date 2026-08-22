## ADDED Requirements

### Requirement: RuntimePathSelectionProtocol
The client/server protocol SHALL carry requests and responses for browsing server directories and applying editable runtime resource paths.

#### Scenario: Select a directory through the protocol
- **WHEN** a connected client requests server-directory browsing and submits an updated user skill-path list
- **THEN** the server returns the directory entries and acknowledges only a successfully persisted settings update
