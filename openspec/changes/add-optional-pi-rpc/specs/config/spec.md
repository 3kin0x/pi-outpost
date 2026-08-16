## ADDED Requirements

### Requirement: AgentRuntimeSelection

The configuration SHALL select the agent runtime as either `embedded` or `rpc`, defaulting to
`embedded`. RPC configuration SHALL name the Pi executable and MAY supply extra fixed arguments;
the command SHALL always be invoked in Pi RPC mode by pi-outpost rather than relying on an argument
the operator happens to include.

The configured executable and arguments SHALL be logged in a form that excludes secrets. Invalid
runtime values, an empty executable, arguments that try to override RPC mode, or a conflicting
session/agent directory setting SHALL make startup fail with an error naming the invalid setting.

#### Scenario: EmbeddedRemainsDefault
- **GIVEN** a configuration with no runtime selection
- **WHEN** pi-outpost starts
- **THEN** it uses the embedded runtime with its existing behavior

#### Scenario: RpcRuntimeConfigured
- **GIVEN** a configuration selecting `rpc` and a valid Pi executable
- **WHEN** pi-outpost starts
- **THEN** it starts that executable in RPC mode and logs the selected runtime without secrets

#### Scenario: InvalidRpcConfiguration
- **WHEN** RPC runtime configuration has an unknown mode, empty executable, or prohibited override argument
- **THEN** startup fails before the server accepts clients and names the configuration error
