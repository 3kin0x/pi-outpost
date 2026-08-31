## MODIFIED Requirements

### Requirement: GETWebSocket

The API SHALL support `GET /ws` to establish a websocket connection for real-time communication. The connection SHALL be bound to exactly one workspace: the one named in the upgrade request, or the server's default workspace when none is named. The state snapshot it sends SHALL describe that workspace, and SHALL carry the server's credential status: which providers are configured and whether a usable model exists — never a stored key. The snapshot SHALL additionally list every open project with its activity state, so a client can show background work without subscribing to it.

The snapshot SHALL also carry the current model's **accepted thinking levels** — the ordered subset of the known levels the model will actually honour — so a client can present a control that offers only those. Where the runtime cannot report them, the snapshot SHALL omit the list rather than guess, and a client SHALL then fall back to offering the full set.

Both SHALL be present whatever the number of projects open, one included: a client that is told nothing about the project it is bound to cannot name it, and naming it is what the interface owes its user before anything else.

Server messages carrying workspace content SHALL reach only the connections bound to the workspace that produced them. Workspace activity and attention changes SHALL reach every connection regardless of what it is bound to.

#### Scenario: EstablishWebSocketConnection
- **GIVEN** The application is running and the request Origin is allowed
- **WHEN** GET /ws is called with a WebSocket upgrade
- **THEN** WebSocket connection is established and a state snapshot is sent

#### Scenario: DisallowedOrigin
- **GIVEN** The application is running
- **WHEN** GET /ws is called with an Origin that is neither localhost nor listed in `server.allowedOrigins`
- **THEN** The upgrade is rejected

#### Scenario: SnapshotCarriesCredentialStatus
- **GIVEN** a server whose agent directory holds no credentials
- **WHEN** a client connects
- **THEN** the snapshot reports that no provider is configured and no model is usable

#### Scenario: ConnectionWithoutAWorkspaceNamed
- **GIVEN** a client that connects without naming a workspace
- **WHEN** the snapshot is sent
- **THEN** it describes the server's default workspace

#### Scenario: ASingleProjectIsStillDescribed
- **GIVEN** a server with exactly one open project
- **WHEN** a client connects
- **THEN** the snapshot describes that project and lists it among the open ones

#### Scenario: MessagesReachOnlyTheirWorkspace
- **GIVEN** one connection bound to workspace A and another bound to workspace B
- **WHEN** the agent in A emits a streaming event
- **THEN** only the connection bound to A receives it

#### Scenario: SnapshotCarriesTheModelsAcceptedThinkingLevels
- **GIVEN** a server whose current model accepts a proper subset of the known thinking levels
- **WHEN** a client connects
- **THEN** the snapshot carries that ordered subset

#### Scenario: TheAcceptedLevelsFollowAModelChange
- **GIVEN** a connected client
- **WHEN** the model is changed to one that accepts a different subset of thinking levels
- **THEN** the client is told the new subset for the new model

#### Scenario: AnUnreportableSetIsOmitted
- **GIVEN** a runtime that cannot report which thinking levels the model accepts
- **WHEN** a client connects
- **THEN** the snapshot omits the list rather than inventing one
