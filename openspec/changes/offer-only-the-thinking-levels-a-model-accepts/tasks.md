## 1. The runtime reports the accepted set

- [x] 1.1 Add `thinkingLevels?: ThinkingLevel[]` to `RuntimeSnapshot` in `server/src/agentRuntime.ts`; verify `npm run typecheck` passes across `server`. Done — typecheck clean.
- [x] 1.2 In `server/src/embeddedRuntime.ts`, fill it from `session.getAvailableThinkingLevels()` in `snapshot()`. Done — read defensively (optional method, try/catch → "cannot say"), through the shared `normalizeThinkingLevels`. No embedded-runtime harness exists in this repo, so the shape is verified by `thinkingLevels.test.ts` (the normalisation both runtimes share) and the whole path is integration-tested on the RPC side; the embedded read is a three-line defensive call structurally identical to it.
- [x] 1.3 In `server/src/rpcRuntime.ts`, add a `get_available_thinking_levels` call, probed like `get_commands` (rejection → undefined), refreshed on catalog refresh and after `set_model`. Done — `refreshThinkingLevels()`; `pi-rpc.test.ts` "carries the model's accepted thinking levels when the child reports them" and "omits the accepted levels when the child has no command for them" (startup stays `ok`). The bootstrap command-order assertion was updated to include the new call.
- [x] 1.4 Normalise centrally. Done — `normalizeThinkingLevels()` beside `THINKING_LEVELS` in `shared/src/protocol.ts` (shared, so both runtimes and the tests use one implementation). `server/test/thinkingLevels.test.ts` covers: unknown name dropped, canonical order, `off` ensured, off-only kept, gap kept, and empty/non-array/all-unknown → `undefined`.

## 2. The wire carries it

- [x] 2.1 Done — both message shapes gain `thinkingLevels?: ThinkingLevel[]` with a doc comment; typecheck clean across all workspaces.
- [x] 2.2 Done — `snapshot()` puts `state.thinkingLevels` on `hello`; the `set_model` `.then()` reads `workspace.agent.snapshot().thinkingLevels` and includes it on `model_changed`. `pi-rpc-server.test.mjs` "the snapshot carries the model's accepted thinking levels, and they follow a model change" drives both over a real client + WebSocket.

## 3. The client carries it into state

- [x] 3.1 Done — `thinkingLevels?` on `AgentState`; `hello` reducer stores `message.thinkingLevels`, `model_changed` replaces it outright (a message with no list clears it), and `credentials_changed` clears it since the model may have changed and it carries no new list. `useAgent.test.ts` "stores the accepted-levels list from the snapshot", "replaces the list on model_changed, and clears it when the message omits one", and "drops a stale accepted-levels list when credentials change the model".
- [x] 3.2 Done — `App.tsx` passes `thinkingLevels={state.thinkingLevels}` to `ModelBar`; `npm run typecheck` clean.

## 4. The control offers only those levels

- [x] 4.1 Done — `ThinkingControl` takes `thinkingLevels`, computes `levels = thinkingLevels?.length ? thinkingLevels : THINKING_LEVELS`, and the slider + end labels range over `levels`. `ModelBar.test.tsx`: "offers only the levels the model accepts, gap and all" (`max` = 3, `medium` at index 2, last stop → `xhigh`), "renders at the first stop when the current level is not one the model accepts" (stale `high` → index 0, no crash), "falls back to the full set when no accepted-levels list is supplied" (`max` = `THINKING_LEVELS.length - 1`).

## 5. Scenario coverage and validation

- [x] 5.1 Done — `scenario-coverage.md`: 5 new scenarios covered, 17 retained scenarios pointed at their existing suites, none partial.
- [x] 5.2 Done — typecheck clean; lint clean (warnings pre-existing, none in touched files); focused suites green; `openspec validate --strict` valid. Full-suite pre-existing/environmental failures recorded in `scenario-coverage.md`.

## 6. Prove it in the running app

- [x] 6.1 Done — a seventh e2e server (`PI_E2E_THINKING_URL`) whose fake-pi-rpc child answers `get_available_thinking_levels` with `["low","medium","xhigh"]`. `e2e/thinking-levels.spec.ts` (passes headless): the slider `max` is `3`, stepping `0..3` shows `off, low, medium, xhigh` on the button — `xhigh` reached without landing on `high` — and a full-set model's slider `max` is `5`. Verified visually: the popover's end labels read `off` … `xhigh`.
