## MODIFIED Requirements

### Requirement: SystemCapabilities

The system SHALL provide the following capabilities:
- Real-time chat with Pi over a WebSocket (streaming, abort, steering), using the embedded SDK by
  default or a configured Pi RPC subprocess
- Session management: create, switch, delete, list, compact, fork, and tree navigation
- Optional sandbox confining file tools to a scoped directory (read-only and read-write zones)
- Tool, extension, skill, prompt-template, and model allowlists via config
- Branding (title, welcome text, accent color, theme) via config
- Embedding in a host page through the `@pi-outpost/embed` Shadow-DOM widget

#### Scenario: CapabilitiesProvided
- **GIVEN** the system is operational
- **WHEN** a user interacts with the system
- **THEN** the system provides the documented capabilities

### Requirement: DataFlow

The system SHALL process data through defined paths:

#### Scenario: StandardDataFlow
- **GIVEN** an incoming request
- **WHEN** the request is processed
- **THEN** data flows through: client ClientMessage → WebSocket handler (`server/src/index.ts`) → the agent-runtime boundary (`server/src/agentRuntime.ts`), served by either the embedded pi SDK session or a supervised `pi --mode rpc` child → runtime events converted to ChatItems (`server/src/convert.ts`) → ServerMessage broadcast to all connected clients → `useAgent` reducer updates React state
