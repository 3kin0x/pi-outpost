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

### Requirement: RpcRuntimeServesTheConfiguredResources

The RPC runtime SHALL give the child process the same resource configuration the embedded runtime
gives its session: skill, extension and prompt-template paths, their discovery switches, the tool
allowlist, and the system prompt. pi-outpost's own tools SHALL be available to the child, so an
agent does not lose them by changing runtime.

A configured sandbox SHALL NOT be silently unenforced. Because the sandbox is a replacement toolset
built in this process rather than a setting the agent obeys, selecting it together with the RPC
runtime SHALL fail at configuration load with an error naming both settings.

#### Scenario: RpcChildReceivesConfiguredResources
- **GIVEN** a configuration selecting `rpc` that also names skills, extensions, prompt templates and a tool allowlist
- **WHEN** pi-outpost starts the child
- **THEN** the child is launched with those resources, and with pi-outpost's own tools available to the agent

#### Scenario: SandboxWithRpcIsRefused
- **GIVEN** a configuration selecting `rpc` together with a sandbox
- **WHEN** the configuration is loaded
- **THEN** startup fails naming both settings rather than running the child with unconfined tools
