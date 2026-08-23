# Scenario-to-test matrix

All delta scenarios are covered. The modified main specifications remain covered by their existing suites; this change adds no alternate behavior to scenarios outside these deltas.

| Delta scenario | Coverage | Test evidence |
|---|---|---|
| Switching sessions replaces the plan | covered | `ui/src/useAgent.test.ts` — “applies live changes and replaces the plan with the selected session snapshot”; `e2e/work-plan.spec.ts` — switches between distinct visible plans |
| Fork preserves then isolates work | covered | `server/test/work-plan-server.test.mjs` — “running server restores, forks, reconnects, and broadcasts authoritative Work Plans”; `e2e/work-plan.spec.ts` — fork mutation leaves source sidecar unchanged |
| Snapshot supplies Work Plan | covered | `server/test/work-plan-server.test.mjs` — initial and reconnect `hello` assertions |
| Change reaches all clients | covered | `server/test/work-plan-server.test.mjs` — both clients receive the same completed plan |
| Progressive decomposition | covered | `server/test/work-plan.test.ts` — “progressively decomposes a task without changing its identity” |
| Blocked work is explained | covered | `ui/src/components/WorkPlanPanel.test.tsx` — blocked/review states and blocked reason inspection |
| Atomic task update | covered | `server/test/work-plan.test.ts` — “rejects invalid hierarchy and dependency cycles without changing the input” and tool persistence refusal assertion |
| Activity does not complete work | covered | `server/test/work-plan-server.test.mjs` — the running server executes an unrelated read tool while the task remains `in_progress`, then a fresh snapshot still carries that status |
| Reconcile before completion | covered | `server/test/work-plan.test.ts` — “publishes maintenance and reconciliation guidance on the model-visible tool contract” verifies the guidance consumed in both embedded mode and the RPC extension |
| Resume interrupted work | covered | `server/test/work-plan.test.ts` — sidecar restoration and `action=get`; `server/test/work-plan-server.test.mjs` — restored initial/reconnect snapshots |
| Compaction preserves the plan | covered | `server/test/work-plan-server.test.mjs` — a scripted RPC child rewrites the transcript during compaction; the real server keeps the separate sidecar and reconnect snapshot unchanged |
| Agent reads the plan after compaction | covered | `server/test/work-plan.test.ts` — after replacing transcript content with a compacted summary, `work_plan action=get` returns the complete authoritative plan |
| Readable overview | covered | `ui/src/components/WorkPlanPanel.test.tsx` — “shows hierarchy, distinct states, focus, and aggregate progress” |
| Preview a collapsed plan | covered | `ui/src/components/WorkPlanPanel.test.tsx` — “previews task lines from the collapsed progress control before opening details”; `e2e/work-plan.spec.ts` — hover preview and click-through in the running app |
| Navigate a resource | covered | `ui/src/components/WorkPlanPanel.test.tsx` — workspace resolver assertion; `e2e/work-plan.spec.ts` — opens the real file viewer from a task resource |
