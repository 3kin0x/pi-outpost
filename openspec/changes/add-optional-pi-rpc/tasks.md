## 1. Runtime contract and configuration

- [x] 1.1 Define the server-side agent-runtime adapter around the browser-observable operations,
  normalized snapshot, events, and failure state; migrate embedded behavior behind it without
  changing its public behavior.
- [x] 1.2 Add validated `agentRuntime` configuration (`embedded` default; `rpc` executable and
  fixed arguments), update effective-config output, init/example config, and documentation.
- [x] 1.3 Test config defaults, precedence, redaction, and invalid RPC settings.

## 2. Pi RPC transport

- [x] 2.1 Implement child spawning without a shell, forced RPC mode, resolved cwd/agent/session
  directories, and bounded graceful shutdown.
- [x] 2.2 Implement strict LF-only UTF-8 JSONL framing with correlation, pending-command timeouts,
  backpressure/error handling, and no generic line reader.
- [x] 2.3 Bootstrap normalized state from Pi RPC before declaring the runtime ready; translate
  supported state and streamed events to existing server messages.
- [x] 2.4 Bridge prompt/images, steering, abort, model/thinking controls, compaction, session and
  tree operations, and extension UI requests/responses through the adapter.
- [x] 2.5 Treat child exit, stream error, malformed message, unsupported required response, and
  startup failure as visible fail-closed runtime errors with no automatic retry/replay/fallback.

## 3. Server integration and parity

- [x] 3.1 Replace direct agent-session accesses in the WebSocket handlers, snapshots, health,
  credential/model handling, and lifecycle hooks with the runtime adapter where applicable.
- [x] 3.2 Define and report explicitly any feature that cannot be equivalent in RPC mode; do not
  silently ignore a browser command.
- [x] 3.3 Keep authentication, origin checks, file browser, and browser WebSocket protocol outside
  the RPC transport boundary.

## 4. Tests and running verification

- [x] 4.1 Build a controllable fake Pi RPC child covering command correlation, Unicode separators,
  event streams, extension dialogs, malformed output, blocked stdout, and unexpected exit.
- [x] 4.2 Add adapter and server integration tests for every scenario in the new and modified delta
  specs, and run equivalent focused behavior tests for embedded mode.
- [x] 4.3 Run a real Pi RPC subprocess in the running app: send a prompt with an image, steer,
  answer an extension dialog, switch/fork a session, and inspect the DOM/session transcript.
- [x] 4.4 Verify failure behavior in the running app by terminating the child: health becomes
  unready, an actionable UI error appears, and a later prompt is refused.
- [x] 4.5 Build the scenario-to-test matrix from every `#### Scenario:` in this change, run focused
  tests then relevant server/UI suites, and run `openspec validate add-optional-pi-rpc --strict`.

## Scenario-to-test matrix

Every `#### Scenario:` in this change's delta specs, and what would fail if it broke.
Enumerated with `rg '^#### Scenario:' openspec/changes/add-optional-pi-rpc/`.

| Scenario | Status | Test |
|---|---|---|
| `EmbeddedRemainsDefault` (config) | covered | `agent-runtime-config.test.ts` — "EmbeddedRemainsDefault: no runtime selection means the embedded runtime" |
| `RpcRuntimeConfigured` (config) | covered | `agent-runtime-config.test.ts` — `RpcRuntimeConfigured` suite + `redactRpcCommand` suite (the logged command, secrets replaced) |
| `InvalidRpcConfiguration` (config) | covered | `agent-runtime-config.test.ts` — `InvalidRpcConfiguration` suite, one case per reserved argument |
| `RpcChildReceivesConfiguredResources` (config) | covered | `rpc-resource-args.test.ts` (flag mapping) + `pi-rpc-server.test.mjs` — "RPC child is launched with the configured resources and pi-outpost's own tools" (real argv, through the server) |
| `SandboxWithRpcIsRefused` (config) | covered | `agent-runtime-config.test.ts` — "refuses a sandbox it cannot enforce on a child that builds its own tools" |
| `RpcRuntimeStarts` | covered | `pi-rpc.test.ts` — "bootstraps the snapshot before returning and owns the RPC launch arguments" |
| `RpcRecordContainsUnicodeSeparators` | covered | `pi-rpc.test.ts` — "keeps a literal U+2028 inside one LF-delimited record …" (the fake writes the raw bytes) |
| `RpcStartupFailure` | covered | `pi-rpc.test.ts` — "reports an actionable startup failure instead of falling back" and "rejects a runtime missing a required bootstrap command" |
| `PromptStreamsThroughRpc` | covered | `pi-rpc.test.ts` — the U+2028 test asserts the full `assistant_start … tool_end` event order; verified in the running app against a real `pi` child (graph rendered as SVG in the DOM) |
| `PromptSteersThroughRpc` | covered | `pi-rpc.test.ts` asserts `streamingBehavior: "steer"` on the wire; verified in the running app (steering banner shown mid-stream, essay aborted, steered answer returned) |
| `ExtensionDialogRoundTrip` | covered | `pi-rpc.test.ts` — "round-trips an extension dialog answer with the original id" (asserts the id and that the blocked prompt does not time out); verified in the running app with a real extension dialog |
| `SessionSwitchSynchronizesState` | covered | `pi-rpc.test.ts` — "rebootstraps state and tree after switching sessions"; verified in the running app (switch back restored the transcript and re-rendered the tool card) |
| `UnexpectedChildExit` | covered | `pi-rpc.test.ts` — "fails closed when the child exits unexpectedly"; `pi-rpc-server.test.mjs` asserts the browser error, 503 readiness, the refusal, and that the prompt was not replayed |
| `MalformedRpcRecord` | covered | `pi-rpc.test.ts` — "fails closed on a malformed record and refuses later commands" |
| `ShutdownTerminatesChild` | covered | `pi-rpc.test.ts` — "force-terminates only its child when SIGTERM is ignored" (an unrelated process must still be alive) |
| `BrowserProtocolIsRuntimeIndependent` (architecture) | covered | `pi-rpc-server.test.mjs` — the same `hello`/`error` messages over the ordinary WebSocket; the rest of the suite exercises that protocol in embedded mode |
| `RpcStdioIsNotNetworkAccessible` (architecture) | covered | `pi-rpc-server.test.mjs` — `/rpc` and `/pi-rpc` answer 404 |
| `CapabilitiesProvided` (overview) | covered | the suites above, plus the running-app session covering prompt, image, steering, tools, skills, sessions and failure |

### Runs

- Focused: `pi-rpc.test.ts` 13/13, `pi-rpc-server.test.mjs` 2/2, `rpc-resource-args.test.ts` + `agent-runtime-config.test.ts` 48/48, `structuredExchangeConformance.test.ts` 76/76, `cli.test.ts` 30/30.
- Full server suite: **1078/1078**; UI suite **1117/1117**.
- `openspec validate add-optional-pi-rpc --strict`: valid.

### Found by running it, not by the suites

A real `pi --mode rpc` child loads pi-outpost's tools extension through jiti, whose interop adds a
`default` property pointing back at the imported JSON schema. `default` is a JSON Schema keyword, so
the compiler descended into it forever and every `present_structure` call came back "Maximum call
stack size exceeded" — with a valid document. Fixed in `shared/src/structuredExchangeSchemaNode.ts`
and pinned by `structuredExchangeConformance.test.ts` → "schema module interop".
