## ADDED Requirements

### Requirement: AgentRuntimeBoundary

The server SHALL own a single agent-runtime boundary that translates between the typed web protocol
and either an embedded Pi SDK session or a configured Pi RPC subprocess. The frontend SHALL remain
unaware of the selected runtime and SHALL not gain direct process or Pi protocol access.

The runtime boundary SHALL preserve the server's ownership of browser authentication, origin checks,
file-browser operations, and client broadcasting. Selecting RPC SHALL not expose the RPC standard
streams on the network.

#### Scenario: BrowserProtocolIsRuntimeIndependent
- **GIVEN** the server starts with either supported runtime
- **WHEN** the frontend sends a supported agent message
- **THEN** it uses the same typed WebSocket contract and receives the same category of observable state

#### Scenario: RpcStdioIsNotNetworkAccessible
- **GIVEN** the server runs a Pi RPC subprocess
- **WHEN** a remote network client connects to pi-outpost
- **THEN** it cannot connect directly to Pi's standard input or output
