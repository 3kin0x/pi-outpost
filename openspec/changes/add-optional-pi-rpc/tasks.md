## 1. Runtime contract and configuration

- [ ] 1.1 Define the server-side agent-runtime adapter around the browser-observable operations,
  normalized snapshot, events, and failure state; migrate embedded behavior behind it without
  changing its public behavior.
- [ ] 1.2 Add validated `agentRuntime` configuration (`embedded` default; `rpc` executable and
  fixed arguments), update effective-config output, init/example config, and documentation.
- [ ] 1.3 Test config defaults, precedence, redaction, and invalid RPC settings.

## 2. Pi RPC transport

- [ ] 2.1 Implement child spawning without a shell, forced RPC mode, resolved cwd/agent/session
  directories, and bounded graceful shutdown.
- [ ] 2.2 Implement strict LF-only UTF-8 JSONL framing with correlation, pending-command timeouts,
  backpressure/error handling, and no generic line reader.
- [ ] 2.3 Bootstrap normalized state from Pi RPC before declaring the runtime ready; translate
  supported state and streamed events to existing server messages.
- [ ] 2.4 Bridge prompt/images, steering, abort, model/thinking controls, compaction, session and
  tree operations, and extension UI requests/responses through the adapter.
- [ ] 2.5 Treat child exit, stream error, malformed message, unsupported required response, and
  startup failure as visible fail-closed runtime errors with no automatic retry/replay/fallback.

## 3. Server integration and parity

- [ ] 3.1 Replace direct agent-session accesses in the WebSocket handlers, snapshots, health,
  credential/model handling, and lifecycle hooks with the runtime adapter where applicable.
- [ ] 3.2 Define and report explicitly any feature that cannot be equivalent in RPC mode; do not
  silently ignore a browser command.
- [ ] 3.3 Keep authentication, origin checks, file browser, and browser WebSocket protocol outside
  the RPC transport boundary.

## 4. Tests and running verification

- [ ] 4.1 Build a controllable fake Pi RPC child covering command correlation, Unicode separators,
  event streams, extension dialogs, malformed output, blocked stdout, and unexpected exit.
- [ ] 4.2 Add adapter and server integration tests for every scenario in the new and modified delta
  specs, and run equivalent focused behavior tests for embedded mode.
- [ ] 4.3 Run a real Pi RPC subprocess in the running app: send a prompt with an image, steer,
  answer an extension dialog, switch/fork a session, and inspect the DOM/session transcript.
- [ ] 4.4 Verify failure behavior in the running app by terminating the child: health becomes
  unready, an actionable UI error appears, and a later prompt is refused.
- [ ] 4.5 Build the scenario-to-test matrix from every `#### Scenario:` in this change, run focused
  tests then relevant server/UI suites, and run `openspec validate add-optional-pi-rpc --strict`.
