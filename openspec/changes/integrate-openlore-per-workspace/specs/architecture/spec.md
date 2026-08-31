## MODIFIED Requirements

### Requirement: LayeredArchitecture

The system SHALL maintain separation between:
- Frontend (React components + `useAgent` state; renders ChatItems, never talks to the pi SDK directly)
- Wire protocol (`shared/src/protocol.ts`; single source of truth for ClientMessage/ServerMessage)
- Server (WebSocket handler, config, sandbox, file browser; the only layer that touches the pi SDK and the file system)

The server SHALL hold zero or more workspaces, each owning one agent session and the resources rooted at that workspace's directory. Each client connection is bound to exactly one workspace, and the server routes messages by that binding rather than broadcasting to every client.

Structural code analysis SHALL reach the system through one adapter over the analysis tool's own supported programmatic surface, owned by the server layer and scoped to a workspace. That adapter SHALL be the only place that knows anything specific to the analysis tool: no other module, and nothing in the frontend or the wire protocol, SHALL depend on its internals, and replacing it SHALL not change the protocol the frontend compiles against.

#### Scenario: LayerSeparation
- **GIVEN** a user action in the frontend
- **WHEN** agent work is needed
- **THEN** the frontend sends a ClientMessage over the WebSocket
- **AND** direct pi SDK or file-system access from the frontend is prohibited

#### Scenario: WorkspaceOwnsItsResources
- **GIVEN** a server holding several workspaces
- **WHEN** one of them rebuilds its toolset or moves its root
- **THEN** the other workspaces' sessions, roots, watchers and toolsets are unaffected

#### Scenario: TheAnalysisToolIsBehindOneAdapter
- **GIVEN** the server's code-intelligence capability
- **WHEN** the analysis tool's own interfaces change shape
- **THEN** only the adapter is affected
- **AND** the wire protocol, the frontend and the rest of the server are unchanged

### Requirement: SecurityModel

The system SHALL implement security via network scoping, an optional shared token, and sandboxing:
- The server binds to 127.0.0.1 by default (`server.host` config to override deliberately)
- WebSocket upgrades are rejected unless the Origin is localhost/127.0.0.1 or an exact match in `server.allowedOrigins`
- When a token is configured (`server.token` / `PI_OUTPOST_TOKEN`), the WebSocket and the HTTP API additionally require it (timing-safe comparison); binding beyond localhost without a token is the operator's explicit choice
- When a sandbox is configured, built-in file tools are replaced by scoped ones confined to `sandbox.root` (writes further confined to `sandbox.writableRoot`, bash off by default). A sandbox is scoped to the workspace it belongs to: a workspace's tools are confined to that workspace's root, never to another workspace's
- A client may open a workspace at any server-side path it can reach through the directory picker, exactly as it may already move the sandbox root there; the boundary is the configured lock, not an enumeration of allowed roots. A workspace opened this way is sandboxed at its own root like any other
- Session switching only accepts paths returned by the SessionManager listing (no arbitrary file paths), and only from the session manager of the workspace the connection is bound to
- A workspace's code-intelligence runtime, where it runs as a separate process reached over a local endpoint, SHALL be bound to a loopback address and SHALL be reachable only with the credential established when it was started; it SHALL NOT be exposed on the network, and the pi-outpost network surface SHALL NOT proxy to it
- Structural analysis SHALL NOT widen any workspace's sandbox. A federated answer about a peer repository is knowledge only: it SHALL confer no read, write, execution or session access that the workspace's own sandbox does not already grant, and every tool call SHALL be confined as before

#### Scenario: CrossOriginRejected
- **GIVEN** a WebSocket upgrade with an Origin not in the allowlist
- **WHEN** the connection is attempted
- **THEN** the server rejects the upgrade

#### Scenario: TokenRequired
- **GIVEN** a configured token
- **WHEN** a WebSocket connects without it (or /branding is fetched without the bearer header)
- **THEN** the connection is closed with an auth-failure code (or 401 returned) before any agent data flows

#### Scenario: SandboxedFileAccess
- **GIVEN** a configured sandbox root
- **WHEN** an agent tool tries to read or write outside that root (including via symlinks)
- **THEN** the tool call fails with an error

#### Scenario: OpeningAWorkspaceUnderALock
- **GIVEN** a configuration that forbids opening projects
- **WHEN** a client asks to open a directory as a workspace
- **THEN** it is refused, and no session or sandbox is created for that path

#### Scenario: ANewWorkspaceIsSandboxedAtItsOwnRoot
- **GIVEN** a sandboxed server
- **WHEN** a client opens a directory as a new workspace
- **THEN** that workspace's tools are confined to that directory, not to the one the server started in

#### Scenario: SessionsCannotBeOpenedAcrossWorkspaces
- **GIVEN** a connection bound to workspace A
- **WHEN** it asks to open a session file belonging to workspace B
- **THEN** the request is refused

#### Scenario: TheAnalysisEndpointIsNotOnTheNetwork
- **GIVEN** a workspace whose code-intelligence runtime is serving a local endpoint
- **WHEN** a remote network client connects to pi-outpost
- **THEN** it cannot reach that endpoint through pi-outpost, and the endpoint answers no non-loopback caller

#### Scenario: AFederatedAnswerIsNotAKey
- **GIVEN** a workspace whose analysis is federated with a peer repository outside its sandbox
- **WHEN** the agent uses the federated answer to try to read, write or run something under that peer's path
- **THEN** the tool call is refused exactly as it would be without federation
