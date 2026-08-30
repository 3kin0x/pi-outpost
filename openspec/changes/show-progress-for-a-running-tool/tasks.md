## 1. The wire

- [x] 1.1 Add `progress?: number` to the `tool_update` server→client message in `shared/src/protocol.ts`, documented as a fraction in `0..1`, absent when unknown; verify `npm run typecheck` passes and a protocol snapshot/shape test (if present) is updated. Done — field added with a doc comment; no snapshot test exists; typecheck clean.
- [x] 1.2 Add `progress?: number` to the internal `tool_update` event in `server/src/agentRuntime.ts`; verify typecheck passes across `server`. Done — typed `progress?: unknown` (carried raw, sanitised once at the broadcast; matches the event's existing `content: unknown`).
- [x] 1.3 Add `progress?: number` to the tool chat-item (tool `kind`) in `shared` and thread the type through `ui/src/useAgent.ts`'s tool-item shape; verify typecheck passes across `shared` and `ui`. Done — added to `ChatItem` tool kind; `ui`'s `ToolItem = Extract<ChatItem, {kind:"tool"}>` picks it up; full `npm run typecheck` clean.

## 2. The runtimes read what the tool volunteered

- [x] 2.1 In `server/src/rpcRuntime.ts` `tool_execution_update`, read `partialResult?.details?.progress` and include it on the emitted `tool_update` event, untouched; verify a `pi-rpc` runtime test drives an update whose `partialResult.details.progress` is `0.4` and asserts the emitted event carries `progress: 0.4`. Done — both runtimes now call a shared `toolUpdateEvent(toolCallId, partial)` helper in `agentRuntime.ts` (see design.md, decision 3). `pi-rpc.test.ts` "forwards a tool's completion fraction…" drives `0.4` through the real fake-RPC child.
- [x] 2.2 In `server/src/embeddedRuntime.ts` `tool_execution_update`, do the same from `event.partialResult?.details?.progress`; verify an embedded-runtime test asserts the emitted event carries the fraction. Done — `embeddedRuntime.ts` calls the same `toolUpdateEvent` helper; the helper's own tests (`toolProgress.test.ts`) assert the fraction and its absence for the exact extraction both runtimes use. (No embedded-runtime harness exists; the helper is the seam, tested directly.)
- [x] 2.3 Verify both runtimes are defensive: a test drives a `tool_execution_update` with no `details` (and one with no `partialResult`) and asserts the emitted event simply omits `progress` and does not throw. Done — `toolProgress.test.ts` covers no `details` and no `partial` at all; `pi-rpc.test.ts` drives a real update with no `details` and asserts `progress` is omitted.

## 3. Clamp and validate once, at the broadcast boundary

- [x] 3.1 In `server/src/index.ts` `tool_update` case, coerce `event.progress` to a finite number, clamp to `[0, 1]`, and include it on the broadcast only when it is a finite number; verify unit tests cover: `1.7 → 1`, `-0.2 → 0`, `0.3 → 0.3`, `NaN`/`Infinity`/`"x"`/`undefined → field omitted`. Done — `toProgressFraction()` in `convert.ts`, used by the `tool_update` case; a progress-only update (no text) now still broadcasts. `convert.test.ts` "toProgressFraction" covers every listed case.
- [x] 3.2 Verify a decreasing fraction passes through unchanged: a test broadcasts `0.8` then `0.3` for one `toolCallId` and asserts the second broadcast carries `progress: 0.3` (no `Math.max`). Done — `multiProjectWorkspaces.test.mjs` "a tool's progress reaches its own project's clients, clamped, and no others" asserts the delivered sequence is `[0.8, 0.3, 1]` over the real server + WebSocket; `toProgressFraction` unit test also asserts no trajectory policing.
- [x] 3.3 Verify workspace isolation: a test with two workspaces asserts a `tool_update` with `progress` for workspace A reaches only A's subscribers (extend/assert on the existing broadcast-scoping test). Done — same `multiProjectWorkspaces.test.mjs` test: the client bound to the other project receives zero `tool_update` frames.

## 4. The client carries it while the tool runs

- [x] 4.1 In `ui/src/useAgent.ts` `tool_update` handler, merge `progress` onto the tool item **only when the message carries a number**, so a text-only update leaves the previous value in place; verify a reducer test: `tool_start` → `tool_update {progress:0.25}` → `tool_update {text:"…"}` leaves `item.progress === 0.25`. Done — `useAgent.test.ts` "carries a tool's completion fraction, and keeps the last one when an update omits it".
- [x] 4.2 Verify `tool_end` closes the bar without progress bookkeeping: a reducer test asserts that after `tool_end` the item has `running === false` (its `progress` value may remain but is no longer shown per task 5). Done — same reducer test ends the tool and asserts `running === false`.
- [x] 4.3 Verify history reconstruction carries no progress: a `convert.ts` test asserts a tool item rebuilt from session history has `progress === undefined`, whether the tool is mid-run or already complete. Done — `convert.test.ts` "a tool call rebuilt from history carries no completion fraction".

## 5. The bar

- [x] 5.1 In `ui/src/components/ToolCard.tsx`, render a determinate `<progress value={item.progress} max={1}>` in the card container, above the presentation slot, gated on `item.running && item.progress != null`; verify component tests: no bar before a fraction, a bar at the right value after one, the last value retained when a later update omits it, and no bar after `tool_end` (success and error). Done — bar sits between the header button and the body; `ToolCard.test.tsx` "completion progress bar" covers all four cases.
- [x] 5.2 Verify the bar is presentation-independent: a component test with a specialized presentation (e.g. a structured-exchange or code-search result) still shows the bar while running. Done — "shows the bar independently of a specialized presentation" uses a running `edit` tool (diff presentation) and still finds the bar at `0.6`.

## 6. A tool that reports progress

- [x] 6.1 Ship the progress-reporting artifacts. (a) A `progress-demo.mjs` extension tool whose `execute` calls `onUpdate({ content, isPartial: true, details: { progress } })` a few times over a short delay then returns — the documented pattern, usable under `BENCH_LIVE=1` with a real model; verify its `ToolDefinition` shape typechecks. (b) A `progressDemo` scripting path in `server/test/fixtures/fake-pi-rpc.mjs` that, on `prompt`, emits `tool_execution_start` → spaced `tool_execution_update` records with a rising `partialResult.details.progress` → `tool_execution_end`. Done — (a) `server/test/fixtures/progress-demo.ts`, typed as `ToolDefinition` from the SDK so `tsc` verifies the `execute(…, onUpdate, …)` signature; (b) `emitProgressDemo()` in `fake-pi-rpc.mjs`, `{ steps, intervalMs, toolName, error }`. `pi-rpc.test.ts` (31 tests) still green.

## 7. Docs

- [x] 7.1 Add a short "Reporting progress from a tool" note to the extension authoring reference. Done — new subsection under "Extension Custom UI" in `README.md`: report a `0..1` fraction via `onUpdate(…, { details: { progress } })`, with a code sample matching `ToolDefinition`; it is a hint, shown only while running, no label, clamped, appears after the first fraction, clears on finish.

## 8. Scenario coverage and validation

- [x] 8.1 Enumerate every `#### Scenario:` in `specs/tool-progress/spec.md` and write a scenario-to-test matrix in `scenario-coverage.md`. Done — 13 scenarios, 12 `covered`, 1 `partial` ("The bar shows wherever the tool card shows" — asserted at the shared `ToolCard` with a specialized presentation, not driven through a live embed host).
- [x] 8.2 Run the focused tests, the relevant `server`/`ui` suites, typecheck, lint, and strict validation; record in `scenario-coverage.md`. Done — typecheck clean; lint clean; focused suites green (`toolProgress`, `convert`, `pi-rpc`, `multiProjectWorkspaces`, `ToolCard`/`useAgent` 161); `openspec validate --strict` valid. Pre-existing environmental failures noted (server: pptx tooling / symlink privilege / git-tag; ui: `--localstorage-file` — 23/23 reproduced on clean `main`).

## 9. Prove it in the running app

- [x] 9.1 Rebuild `web` → `@pi-outpost/embed` → `build:e2e-host`; on a server whose fake-pi-rpc child is configured with `progressDemo`, send a prompt and read the DOM back. Done — a sixth e2e server (`PI_E2E_PROGRESS_URL`, `progressDemo: { steps: 5, intervalMs: 500 }`) in `global-setup.ts`; the spec reads the `<progress>` element's `value` property (rises `0.2…→1`) and its removal after `tool_execution_end`. Screenshot captured showing the green determinate bar on the running `crawl` card between the header and the body. Embed host: not driven separately — same `ToolCard` component, covered by the `partial` row in `scenario-coverage.md`.
- [x] 9.2 Add a Playwright spec that points at the `progressDemo`-scripted server and asserts the bar appears, advances, and disappears on completion. Done — `e2e/tool-progress.spec.ts`; passes headless (`npx playwright test --config e2e/playwright.config.ts tool-progress`).
