## Context

See proposal.md — Why. The current server directly owns a mutable `AgentSession`; its event
subscription, session manager, model registry, extension UI binding, and file tools are accessed
throughout `server/src/index.ts`. Pi’s documented RPC mode is a persistent JSONL process with
correlated commands and asynchronous events, including the extension-UI request/response protocol
already represented in the web wire types.

## Goals / Non-Goals

**Goals:**

- Keep `embedded` as the default runtime with no behavior change.
- Establish one server-side runtime interface that projects either Pi transport into existing
  snapshots and browser messages.
- Supervise a Pi child process without unsafe shell interpolation, record framing errors precisely,
  and stop safely.

**Non-Goals:**

- Exposing Pi RPC over HTTP/TCP, connecting to a remotely hosted Pi process, or supporting a pool
  of Pi processes.
- Automatic restart, automatic command replay, or transparent fallback to embedded mode.
- Making all third-party extension functionality portable; unsupported TUI-only behavior remains
  unavailable as it is in Pi RPC itself.

## Decisions

**Use a discriminated runtime adapter, not RPC branches inside the WebSocket handler.** The adapter
owns lifecycle, commands, state bootstrap, and normalized events; server handlers call that
interface. This keeps the frontend protocol stable and constrains the embedded session’s current
direct coupling to an intentional migration seam. *Alternative considered:* condition every
`runtime.session` use; rejected because session replacement, extension UI, and event conversion
would drift between modes.

**Spawn Pi without a shell and force `--mode rpc`.** The configured executable and fixed argv are
passed as an argument vector, with the working/session/agent directories resolved before spawn.
Pi-outpost appends and owns the mode flag, rejecting conflicting mode arguments. *Alternative
considered:* configurable shell command; rejected because quoting ambiguity and shell injection
would turn configuration into code execution.

**Implement LF-only JSONL decoding with `StringDecoder`.** Buffer UTF-8 bytes, split only on LF,
strip an optional trailing CR, and parse each remaining record exactly once. *Alternative
considered:* Node `readline`; rejected because it also splits Unicode line separators that are
valid JSON content under Pi’s RPC contract.

**Bootstrap with state, entries, tree, and models before readiness.** The adapter sends correlated
RPC queries after the child is ready, builds a single normalized snapshot, and only then permits
browser commands. This makes a reconnect after Pi startup deterministic. *Alternative considered:*
reconstruct UI state only from future events; rejected because sessions can contain prior history.

**Fail closed on child/process protocol loss.** A child exit or malformed record transitions the
adapter to failed, rejects new web commands, broadcasts one visible runtime error, and marks health
unready. No restart or replay occurs. *Alternative considered:* automatic restart; rejected because
the last prompt or tool may already have produced side effects.

## Risks / Trade-offs

- Pi RPC evolves independently of the embedded package → pin/document a supported Pi CLI version
  and contract-test the event/command subset against a fake process and a real installed Pi.
- Existing session helpers rely on SDK internals → route all session/model actions through the
  adapter incrementally, with parity tests for both modes.
- A custom executable has broad local authority → RPC mode remains opt-in, executable/argv are
  visible in effective config, no shell is used, and the child inherits only deliberate environment.
- A child can hang during shutdown → bounded graceful termination followed by a targeted kill of
  the child PID, never a process-group-wide command.

## Migration Plan

Existing configurations select `embedded` implicitly. RPC users opt in with `agentRuntime.mode` and
an executable path; rollback removes that configuration and restarts into embedded mode. RPC session
files remain Pi session files, so rollback does not rewrite or delete them.
