# Scenario coverage

Every `#### Scenario:` in the two delta files, enumerated with
`rg '^#### Scenario:' openspec/changes/offer-only-the-thinking-levels-a-model-accepts/`.
Both requirements are MODIFIED, so the deltas reproduce scenarios this change does not
touch; those are marked **retained** and point at the suite that already proves them.

Test files:

- `server/test/thinkingLevels.test.ts` (`norm`) — the shared `normalizeThinkingLevels` sanitiser
- `server/test/pi-rpc.test.ts` (`rpc`) — the RPC runtime over the real fake-pi-rpc child
- `server/test/pi-rpc-server.test.mjs` (`wire`) — a real server + real WebSocket
- `ui/src/useAgent.test.ts` (`reducer`) — the client reducer over `mockWs`
- `ui/src/components/ModelBar.test.tsx` (`bar`) — the `ThinkingControl` component
- `e2e/thinking-levels.spec.ts` (`e2e`) — Chromium against the running app, RPC child scripted

## api — GETWebSocket

| Scenario | Status | Where | What would fail |
|---|---|---|---|
| EstablishWebSocketConnection | retained | existing `server/test/*` websocket suites | unchanged by this change |
| DisallowedOrigin | retained | `server/test/cors.test.mjs` | unchanged |
| SnapshotCarriesCredentialStatus | retained | `server/test/credentials.test.mjs` | unchanged |
| ConnectionWithoutAWorkspaceNamed | retained | `server/test/multiProjectWorkspaces.test.mjs` | unchanged |
| ASingleProjectIsStillDescribed | retained | `server/test/multiProjectWorkspaces.test.mjs` | unchanged |
| MessagesReachOnlyTheirWorkspace | retained | `server/test/multiProjectWorkspaces.test.mjs` | unchanged |
| SnapshotCarriesTheModelsAcceptedThinkingLevels | covered | `wire` "the snapshot carries the model's accepted thinking levels, and they follow a model change"; `rpc` "carries the model's accepted thinking levels when the child reports them" | `wire` connects a real client to a server whose RPC child returns `["low","medium","xhigh"]` and asserts `hello.thinkingLevels === ["off","low","medium","xhigh"]` (sanitised). `rpc` asserts the runtime snapshot carries it, unknown names dropped. Remove the `get_available_thinking_levels` call and both fail. |
| TheAcceptedLevelsFollowAModelChange | covered | `wire` same test; `reducer` "replaces the list on model_changed…" | `wire` sends `set_model` to a second model whose scripted answer is `["off","high"]` and asserts the `model_changed` frame carries exactly that. `reducer` asserts the client state replaces the stored list on `model_changed`. |
| AnUnreportableSetIsOmitted | covered | `rpc` "omits the accepted levels when the child has no command for them"; `norm` "an empty list, a non-array, or all-unknown names yield undefined" | `rpc` scripts the child to reject `get_available_thinking_levels` as an unknown command and asserts `snapshot().thinkingLevels === undefined` and `runtime.ok`. `norm` asserts the sanitiser yields `undefined` for empty / non-array / all-unknown input, so the field is genuinely omitted rather than an empty array. |

## components — RuntimeControls

| Scenario | Status | Where | What would fail |
|---|---|---|---|
| ChangeModelOrThinkingLevel | covered | `bar` "sets the thinking level from the slider" (retained assertion) | selecting a level still invokes `onSetThinking` with the chosen value |
| TheThinkingControlOffersOnlyTheModelsLevels | covered | `bar` "offers only the levels the model accepts, gap and all"; `e2e` "the thinking slider offers only the levels the model accepts, in order, with no gap stop" | `bar` supplies `["off","low","medium","xhigh"]`, asserts the slider `max` is `3` (four stops, no `high`), that `medium` sits at index 2, and that the last stop reports `xhigh`. `e2e` drives the same over the real app: `max="3"`, and stepping `0..3` shows `off, low, medium, xhigh` on the button — `xhigh` reached without ever landing on `high`. |
| TheThinkingControlFallsBackWithoutAList | covered | `bar` "falls back to the full set when no accepted-levels list is supplied", "renders at the first stop when the current level is not one the model accepts"; `reducer` "…clears it when the message omits one"; `e2e` "a model that accepts every level still shows all six stops" | `bar` with no `thinkingLevels` prop asserts the slider `max` equals `THINKING_LEVELS.length - 1`. `reducer` asserts `model_changed` / `credentials_changed` without a list clear the state field. `e2e` asserts the full-set model's slider `max` is `5`. |
| PresentSandboxSettings | retained | `ui/src/components/SettingsMenu.test.tsx` | unchanged |
| Select a server skill directory | retained | `SettingsMenu.test.tsx` | unchanged |
| Remove a user skill path | retained | `SettingsMenu.test.tsx` | unchanged |
| Select a server extension directory | retained | `SettingsMenu.test.tsx` | unchanged |
| Remove a user extension path | retained | `SettingsMenu.test.tsx` | unchanged |
| Adding an extension path says what it means | retained | `SettingsMenu.test.tsx` | unchanged |
| A locked deployment offers no extension control | retained | `SettingsMenu.test.tsx` | unchanged |
| Every inventory opens from a counted summary | retained | `SettingsMenu.test.tsx` | unchanged |
| Inventories read in a stable order | retained | `SettingsMenu.test.tsx` | unchanged |
| SubmitAuthenticationToken | retained | `ui/src/components/TokenGate.test.tsx` | unchanged |
| NavigateConversationTree | retained | `ui/src/components/TreeMenu.test.tsx` | unchanged |

## Result

All three new `api` scenarios and both new `components` scenarios are **covered**. The
retained scenarios are unchanged by this change and remain proven by their existing
suites.

## The run

- `npm run typecheck` — clean across `shared`, `server`, `web`, `embed`
- lint (`oxlint`) — clean; the warnings printed are pre-existing and in untouched files
- focused: `thinkingLevels.test.ts`, `pi-rpc.test.ts` (31), `pi-rpc-server.test.mjs`, `ui` `ModelBar`/`useAgent` (156 pass) — all green
- `e2e/thinking-levels.spec.ts` — passes headless (`npx playwright test thinking-levels`): a `["low","medium","xhigh"]` model shows a 4-stop slider ending at `xhigh` with no `high`; a full-set model shows six
- full `server` suite — 1633 pass; pre-existing environmental failures on this Windows box (`pptx_extract` tooling absent, `listServerDirectories`/`update` symlink privilege, `detectChannel` git tags) plus two load-only flakes (`serializedBytes`, the RPC command-timeout timing test) that pass in isolation
- full `ui` suite — the `localStorage`-dependent files fail on this machine for lack of `--localstorage-file`, and one pre-existing `ModelBar` context-ring test fails on clean `main`; unrelated to this change
- `openspec validate offer-only-the-thinking-levels-a-model-accepts --strict` — valid
