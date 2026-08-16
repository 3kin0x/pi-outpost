# pi-rpc-runtime Specification

## Purpose

Lets pi-outpost run Pi as a supervised RPC child process while preserving the browser-facing agent
experience and making process failures explicit to the operator.

## Requirements

### Requirement: SupervisedPiRpcRuntime

When RPC runtime mode is selected, the system SHALL start the configured Pi executable in RPC mode
with the configured working, agent, and session directories. It SHALL exchange strict LF-delimited
JSON records over the child process's standard input and output, preserve request correlation, and
translate supported Pi responses and events into the existing web-agent state and messages.

The system SHALL obtain Pi state and history before announcing a usable session to web clients, so
a client connecting immediately after startup receives an accurate snapshot rather than a partly
initialized conversation.

#### Scenario: RpcRuntimeStarts
- **GIVEN** a configured executable that starts Pi RPC successfully
- **WHEN** pi-outpost starts in RPC mode
- **THEN** it exposes the active Pi session and model state through the existing web connection

#### Scenario: RpcRecordContainsUnicodeSeparators
- **GIVEN** a valid RPC JSON record containing a Unicode line-separator character in content
- **WHEN** the process output is consumed
- **THEN** it is handled as one record and not split before its LF delimiter

#### Scenario: RpcStartupFailure
- **WHEN** the configured executable cannot be started or Pi rejects RPC initialization
- **THEN** pi-outpost reports an actionable startup failure and does not silently run the embedded runtime

### Requirement: RpcRuntimePreservesCoreAgentInteraction

The RPC runtime SHALL support prompts with image attachments, abort, steering, model selection,
thinking-level selection, manual compaction, session creation and switching, session naming,
conversation-tree navigation and forking whenever Pi RPC exposes the corresponding command. It
SHALL relay assistant, tool, queue, compaction, usage, and extension-UI events to the browser using
the existing observable semantics.

An RPC command rejected before acceptance SHALL be reported to the initiating web client. A failure
after a prompt has been accepted SHALL remain visible through the streamed event or conversation
state; it SHALL not cause a second synthetic prompt acceptance result.

#### Scenario: PromptStreamsThroughRpc
- **WHEN** a client sends a prompt while the RPC runtime is idle
- **THEN** Pi receives the prompt and the client observes its streamed assistant and tool activity

#### Scenario: PromptSteersThroughRpc
- **GIVEN** Pi is streaming a turn
- **WHEN** a client sends a new prompt
- **THEN** the runtime sends a steering request and the queued instruction is visible to clients

#### Scenario: ExtensionDialogRoundTrip
- **WHEN** an extension running in Pi RPC asks a dialog question
- **THEN** the browser receives the existing extension-UI request and its answer is correlated back to Pi

#### Scenario: SessionSwitchSynchronizesState
- **WHEN** a client switches to an allowed session through the web UI
- **THEN** Pi switches that session and clients receive the resulting session snapshot and tree

### Requirement: RpcProcessFailureIsContained

The system SHALL treat an unexpected RPC process exit, malformed record, or broken standard stream
as an agent-runtime failure. It SHALL stop accepting commands that require the unavailable runtime,
notify connected clients of the failure, and expose unhealthy readiness. It MUST NOT restart Pi or
replay a command automatically, because a tool invocation or prompt may have had side effects.

On orderly pi-outpost shutdown, the system SHALL request child-process termination and wait for it
for a bounded period before forcefully terminating only that configured child process.

#### Scenario: UnexpectedChildExit
- **GIVEN** a running RPC runtime
- **WHEN** its Pi child exits unexpectedly
- **THEN** connected clients see an agent-runtime error and later prompts are refused rather than lost

#### Scenario: MalformedRpcRecord
- **WHEN** Pi emits a record that is not valid JSON or violates the expected RPC shape
- **THEN** the runtime fails closed, reports the protocol failure, and sends no guessed conversation event

#### Scenario: ShutdownTerminatesChild
- **GIVEN** pi-outpost owns a running Pi RPC child
- **WHEN** pi-outpost shuts down
- **THEN** it terminates that child without terminating unrelated processes
