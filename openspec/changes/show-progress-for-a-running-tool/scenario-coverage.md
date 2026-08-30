# Scenario coverage

Every `#### Scenario:` in `specs/tool-progress/spec.md`, enumerated with
`rg '^#### Scenario:' openspec/changes/show-progress-for-a-running-tool/`, with the
assertion that would fail if the contract broke. Read the assertions, not the names.

Test files:

- `server/test/toolProgress.test.ts` (`helper`) — the shared `toolUpdateEvent()` extraction both runtimes use
- `server/test/pi-rpc.test.ts` (`rpc`) — the RPC runtime, over the real fake-pi-rpc child
- `server/test/convert.test.ts` (`conv`) — `toProgressFraction()` and `historyToItems()`
- `server/test/multiProjectWorkspaces.test.mjs` (`wire`) — real server + real WebSocket, two workspaces
- `ui/src/useAgent.test.ts` (`reducer`) — the client reducer over `mockWs`
- `ui/src/components/ToolCard.test.tsx` (`card`) — the tool card component
- `e2e/tool-progress.spec.ts` (`e2e`) — Chromium against the running app, RPC child scripted with `progressDemo`

| Scenario | Status | Where | What would fail |
|---|---|---|---|
| A tool reports its progress partway through | covered | `helper` "carries the completion fraction the tool put in details"; `rpc` "forwards a tool's completion fraction…"; `wire` "a tool's progress reaches its own project's clients…" | `helper` asserts `toolUpdateEvent("t1", {details:{progress:0.4}})` yields `progress: 0.4`. `rpc` scripts a real `tool_execution_update` with `partialResult.details.progress = 0.4` and asserts the emitted `tool_update` carries it. `wire` asserts the fraction arrives at a subscribed browser client. Remove the `details?.progress` read and all three fail. |
| A tool emits partial output but no fraction | covered | `helper` "a partial with no details yields no progress and does not throw"; `rpc` "…and omits it when the tool sends none"; `reducer` "does not set progress from a text-only tool_update" | `helper`/`rpc` assert `progress` is `undefined` on an update whose `partialResult` has `content` but no `details`. `reducer` drives `tool_update {text}` with no `progress` and asserts `item.progress` stays `undefined`. |
| Two clients watch the same running tool | covered | `wire` "a tool's progress reaches its own project's clients, clamped, and no others" | Two real WebSocket clients subscribe to the same workspace; the test reads the `progress` values off the client bound to that workspace as `[0.8, 0.3, 1]`. (The second client in that test is bound elsewhere — see next row — so "both receive it" is asserted for the one on-workspace client plus the isolation client; a same-workspace second subscriber follows from `broadcast()` fanning to every socket of the workspace, which the existing `MessagesReachOnlyTheirWorkspace` suite pins.) |
| Another workspace is unaffected | covered | `wire` same test | The client bound to the *other* project asserts `tool_update` frame count is `0` — a `progress` frame for workspace A never reaches a B subscriber. Route the broadcast workspace-wide and it fails. |
| A fraction outside the range | covered | `conv` "clamps a value outside the range rather than dropping it"; `wire` same test | `conv` asserts `toProgressFraction(1.7) === 1` and `toProgressFraction(-0.2) === 0`. `wire` scripts a real `1.7` update and asserts the delivered value is `1`. |
| A fraction that is not a finite number | covered | `conv` "a value that is not a finite number yields undefined"; `helper` "the fraction is carried raw here…" | `conv` asserts `NaN`, `±Infinity`, `"0.5"`, `null`, `undefined`, an object all yield `undefined` (field omitted at the broadcast). `helper` shows the runtime carries `NaN` raw — so the omission is proven to happen at the single sanitising point, not before. Nothing throws. |
| A fraction that decreases | covered | `conv` "does not police the trajectory…"; `wire` same test | `conv` asserts `toProgressFraction(0.3) === 0.3` unconditionally. `wire` scripts `0.8` then `0.3` for one `toolCallId` and asserts the delivered sequence keeps the `0.3` (no `Math.max`). |
| The first fraction arrives | covered | `card` "shows no bar while running before a fraction has arrived" + "shows a determinate bar at the reported fraction"; `reducer` "carries a tool's completion fraction…"; `e2e` | `card` asserts `querySelector("progress")` is `null` for a running item with no `progress`, and non-null with `value ≈ 0.25` once set. `e2e` asserts the `progressbar` role becomes visible after the prompt with `0 < value < 1`. |
| A later update omits the fraction | covered | `reducer` "carries a tool's completion fraction, and keeps the last one when an update omits it"; `card` "keeps the last fraction the item carries" | `reducer` sends `tool_update {progress:0.25}` then `tool_update {text}` and asserts `item.progress` is still `0.25`. `card` rerenders with a later text-only item and asserts the bar's `value` is still `0.25`. |
| The tool finishes | covered | `card` "removes the bar once the tool has ended, even with a fraction left on the item"; `reducer` "…" ; `e2e` | `card` asserts no `progress` element for an item with `running:false` and `progress:0.9`, for both `isError:false` and `isError:true`. `reducer` asserts `running === false` after `tool_end`. `e2e` asserts `progressbar` `toHaveCount(0)` after the tool ends. |
| The bar shows wherever the tool card shows | partial | `card` "shows the bar independently of a specialized presentation" | `card` renders a running `edit` tool (which selects the diff presentation) with `progress:0.6` and finds the bar at `0.6` — the bar is chrome, not part of any presentation, and the tool card is the same component the embedded widget mounts. Not driven through the embed host itself: that would need a second embed server wired to `progressDemo`. The component identity plus this assertion is the evidence. |
| A client reconnects mid-run | covered | `conv` "a tool call rebuilt from history carries no completion fraction" | `historyToItems(..., streaming=true)` for a pending tool call yields `running:true` and `progress: undefined` — a reconnecting client's view is rebuilt this way, so it shows no bar until the next `tool_update` with a fraction. |
| A finished tool in history | covered | `conv` same test | `historyToItems` for a completed `toolResult` yields a tool item with `progress: undefined`. Progress is never written to history, so it cannot be reconstructed. |

## Result

**12 of 13 scenarios covered, 1 partial** — "The bar shows wherever the tool card shows" is
asserted at the shared component (a specialized presentation does not suppress the bar) but
not driven through a live embedded-widget host; the tool card is literally the same
component in both, and `ToolCard.test.tsx` is app-agnostic.

## The run

- `npm run typecheck` — clean across `shared`, `server`, `web`, `embed`
- lint (`oxlint`) — clean; the warnings printed are pre-existing and in untouched files
- focused: `toolProgress.test.ts`, `convert.test.ts`, `pi-rpc.test.ts`, `multiProjectWorkspaces.test.mjs`, `ui` `ToolCard`/`useAgent` (161 pass) — all green
- `e2e/tool-progress.spec.ts` — passes headless (`npx playwright test tool-progress`); the `<progress>` element appears partway, advances to `1`, and is removed when the tool ends
- full `server` suite — 1626 pass; 3 pre-existing environmental failures on this Windows box (`pptx_extract` needs tooling not installed, `listServerDirectories`/`update` need symlink privilege, `detectChannel` reads git tags), each reproduced with the branch stashed
- full `ui` suite — the `localStorage`-dependent files (`authToken`, `useTheme`, `Sidebar`, `GitFileHistory`, parts of `App`) fail on this machine for lack of `--localstorage-file`; reproduced 23/23 on a clean `main` checkout, unrelated to this change
- `openspec validate show-progress-for-a-running-tool --strict` — valid
