## Why

pi-outpost currently embeds the Pi SDK in its own Node process. Operators who need Pi's standalone
runtime — to align with an existing Pi installation, isolate a crash, or use its RPC integration
boundary — cannot select it without replacing the application.

## What Changes

- Add an optional runtime mode that starts `pi --mode rpc` as a supervised child process and
  translates its JSONL commands, responses, events, and extension-UI requests to the existing web
  protocol.
- Keep the embedded SDK runtime as the default and preserve its current configuration behavior.
- Surface startup, protocol, and unexpected-exit failures as actionable application errors, without
  silently falling back to a different runtime.
- Define the supported session, prompt, streaming, model, compaction, and extension-UI semantics
  for the RPC runtime, including startup synchronization from Pi state.

## Capabilities

### New Capabilities

- `pi-rpc-runtime`: an externally run, supervised Pi RPC process serving the same web agent surface.

### Modified Capabilities

- `config`: chooses the embedded or RPC Pi runtime and validates RPC process settings.
- `overview`: pi-outpost can use an embedded SDK or an optional Pi RPC subprocess.
- `architecture`: the server’s agent-runtime boundary supports a supervised external process while
  the browser continues to use the typed WebSocket protocol unchanged.

## Impact

- Server runtime abstraction, JSONL framing, process lifecycle, event conversion, and session/model
  command bridge.
- Configuration, CLI output/example configuration, health/readiness reporting, and documentation.
- Protocol compatibility tests plus a controllable fake RPC child process for lifecycle tests.
- The external `pi` executable becomes an explicit runtime dependency only when RPC mode is selected.
