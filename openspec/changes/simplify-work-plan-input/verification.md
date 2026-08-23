## Token trade-off

Measured on the shipped two-level action union using the same representative five-task plan for both calls:

| Surface | Serialized bytes |
| --- | ---: |
| Typed schema without `create` | 5,846 |
| Typed schema with `create` | 7,944 |
| Recurring `create` schema overhead | 2,098 |
| Normalized `replace` call | 639 |
| Ergonomic `create` call | 227 |
| One-time model-authored call saving | 412 |

The ergonomic operation reduces the model-authored creation payload by 64%, but does not reduce total context: its 2,098-byte schema branch is present on every request and exceeds the 412-byte saving on the creation call. There is therefore no positive multi-turn break-even under eager tool-schema delivery. `create` is retained as a deliberate usability and schema-validity decision, not claimed as a net context-token optimization.

## Real-model discrimination

On 2026-08-23, `server/scripts/probe-work-plan-input.mjs` ran three interleaved arms with `mistral/mistral-medium-latest`, `thinkingLevel: off`, ten fresh in-memory sessions per arm. Each session was stopped immediately after the first tool result so repair loops could not distort the first-call metric.

| Arm | Accepted first calls | First action | Observed first-call shape |
| --- | ---: | --- | --- |
| Pre-change opaque schema | 0/10 | `replace` in 9/10 | Nine calls omitted normalized plan fields and nested child tasks; one session made no tool call. |
| Typed schema, no `create` | 0/10 | `replace` in 10/10 | All ten supplied normalized outer fields but still nested child `tasks`, which the flat version-1 contract rejects. |
| Typed schema plus compact `create` | 9/10 | `create` in 9/10 | Nine calls supplied three top-level tasks and two direct `subtasks` and normalized without repair; one session made no tool call. |

The probe emits every captured first-call payload as JSONL before its aggregate summary. The complete corrected run—including all 30 calls, no-call outcomes, model identity, thinking setting, and timestamps—is retained in [`evidence/mistral-work-plan-probe.json`](evidence/mistral-work-plan-probe.json).

These arms measure only what their prompt asked for. It named the exact task counts and nesting, which suppressed the failure the running app later exposed (see below); the arms are evidence about schema legibility, not about an unconstrained request.

Selection was tested separately from argument validity. Mistral used `create` reliably when asked to create a Work Plan, but did not spontaneously select the tool for two self-contained conceptual exercises. That model-policy behavior is not strengthened into a mandatory plan for every interaction here; operator skills can require a plan for workflows that need one.

## Running-app verification

### The refusal the probe could not see

Driven from a browser against the development server at `127.0.0.1:3141`, `mistral/mistral-medium-latest` with thinking disabled failed every first `create` call, in two independent sessions, for a reason no arm of the probe exhibited: it supplied an `id` on each task. The published parameters are a ten-branch root `anyOf` sent with `strict: false` — captured from the outgoing provider request, so the schema does reach the model intact and unconstrained — and `id` is a required property of the adjacent `add_task` and `replace` task shapes. The model merged them into `create`.

Recovery then made it worse. A failed union reports `root: must not have additional properties` and `action: must be equal to constant` once per branch and never names the offending property, so the second session's repair deleted its `description` fields, which were valid, and then its entire second level; the first session's third attempt persisted a flat six-task plan with no hierarchy at all. The probe missed this because its prompt dictated the exact shape ("three top-level tasks; give the implementation task two direct subtasks") and its session exposed `work_plan` alone.

The creation schema now accepts an optional task `id` and adopts it, rejecting a duplicate.

### Confirmed behavior after the fix

New session, same model and server, prompt asking only for main tasks and subtasks:

- the **first** tool call is `create` and is accepted — no repair round;
- the persisted plan holds 59 tasks, 47 of them with a `parentId`;
- the panel renders that as `treeitem` elements at `[level=1]` and `[level=2]`, heading "Portage vers une architecture multi-utilisateurs", progress `0 / 59`;
- asked to complete one subtask, the agent called `update_task` with `taskId: "audit_securite"` — an identity **it** chose — with no intervening `get`; the sidecar shows exactly that task `done` and the tree shows `Done Audit de sécurité` at `[level=2]`;
- after a full page reload, the reconnecting client restores the same plan with the same task still `Done`.

## Scenario-to-test matrix

All scenarios in the delta specs and the applicable main `work-plan` and `agent` requirements were enumerated with `rg '^#### Scenario:' openspec/`. String-level prompt tests below prove composition only; they are not cited as evidence that a model follows the guidance.

| Source / scenario | Coverage | Assertion evidence |
| --- | --- | --- |
| main work-plan / Progressive decomposition | covered | `server/test/work-plan.test.ts` — “progressively decomposes a task without changing its identity” |
| main work-plan / Blocked work is explained | covered | `ui/src/components/WorkPlanPanel.test.tsx` — “keeps an unresolved generic resource visible but not clickable” asserts distinct review/blocked reasons |
| main work-plan / Atomic task update | covered | `server/test/work-plan.test.ts` — invalid graph, duplicate ID, invalid nested sidecar, and refused tool mutation assertions |
| main work-plan / Activity does not complete work | covered | `server/test/work-plan-server.test.mjs` — running server performs an unrelated read and a fresh snapshot remains `in_progress` |
| main work-plan / Reconcile before completion | covered | Running-app verification performed a later `update_task` before the agent stopped; provider-boundary embedded/RPC tests independently prove that the reconciliation instruction reaches the model. |
| main work-plan / Resume interrupted work | covered | `server/test/work-plan-server.test.mjs` — initial and reconnect snapshots restore the same plan |
| main work-plan / Compaction preserves the plan | covered | `server/test/work-plan-server.test.mjs` — transcript compaction rewrite leaves the separate sidecar and reconnect snapshot unchanged |
| main work-plan / Agent reads the plan after compaction | covered | `server/test/work-plan.test.ts` — after transcript rewrite, `get` returns complete IDs and resources in model content |
| main work-plan / Readable overview | covered | `ui/src/components/WorkPlanPanel.test.tsx` — distinct states, focus, hierarchy, and aggregate progress |
| main work-plan / Preview a collapsed plan | covered | `ui/src/components/WorkPlanPanel.test.tsx` and `e2e/work-plan.spec.ts` — task-line preview, boxes, Escape, and opening details |
| main work-plan / Navigate a resource | covered | `ui/src/components/WorkPlanPanel.test.tsx` and `e2e/work-plan.spec.ts` — workspace resolver and real file-viewer navigation |
| main agent / Switching sessions replaces the plan | covered | `server/test/work-plan-server.test.mjs` and `e2e/work-plan.spec.ts` — distinct snapshots replace visible state |
| delta agent / DefaultInjection | covered | `server/test/system-prompt.test.ts` — web context precedes product guidance and unchanged operator text |
| delta agent / OptOut | covered | `server/test/system-prompt.test.ts` — web block absent while Work Plan and operator entries remain |
| delta agent / OperatorEntriesPreserved | covered | `server/test/system-prompt.test.ts` — exact array equality preserves bytes and order |
| delta agent / Available tool receives guidance | covered | `server/test/system-prompt.test.ts` — enabled composition contains the canonical selection, resume, maintenance, and reconciliation fragment |
| delta agent / Disabled tool is not advertised | covered | `server/test/system-prompt.test.ts` — unsandboxed allowlist excluding `work_plan` omits its fragment |
| delta agent / Embedded and RPC guidance match | covered | Both real provider-boundary sequences in `server/test/work-plan-server.test.mjs` use the same fixture, which rejects the request unless the canonical guidance is present in `context.systemPrompt`; pure composition and argv preservation are covered separately. |
| delta agent / Operator prompt entries remain intact | covered | `server/test/system-prompt.test.ts` — multi-line and separate operator entries compare exactly |
| delta agent / Behavioral guidance has one owner | covered | `server/test/system-prompt.test.ts` plus `server/test/work-plan.test.ts` — system fragment present once and tool contract lacks selection/reconciliation prose |
| delta work-plan / Creation schema declares its complete input | covered | `server/test/work-plan.test.ts` — recursive serialized-schema walk and bounded `create` branch assertions |
| delta work-plan / Mutation branches require their own arguments | covered | `server/test/work-plan.test.ts` — all ten branches and operation-specific `required` arrays |
| delta work-plan / Clearing optional values is discoverable | covered | `server/test/work-plan.test.ts` — serialized update fields contain JSON `null`; mutation tests clear all supported values |
| delta work-plan / Create a minimal plan | covered | `server/test/work-plan.test.ts` — compact draft normalizes to exact version-1 defaults and generated identities |
| delta work-plan / Create direct subtasks | covered | `server/test/work-plan.test.ts` — two levels flatten to generated parent relationships |
| delta work-plan / The agent names its own tasks | covered | `server/test/work-plan.test.ts` — “honours a task id the agent supplies and generates the rest” asserts adopted identity, generated siblings, parent wiring, and a later `update_task` on the supplied id; reproduced in the running app |
| delta work-plan / Duplicate supplied identity is rejected atomically | covered | `server/test/work-plan.test.ts` — “rejects a duplicate supplied id without persisting anything” |
| delta work-plan / Creation limits are discoverable and atomic | covered | `server/test/work-plan.test.ts` — schema ceilings plus depth, count, size, and no-sidecar assertions |
| delta work-plan / Explicit task fields survive normalization | covered | `server/test/work-plan.test.ts` — exact status, description, reason, and resource preservation |
| delta work-plan / Creation returns usable task identities | covered | `server/test/work-plan.test.ts` — tool result contains generated IDs and remains within 64 KiB plus bounded summary |
| delta work-plan / Creation does not overwrite an existing plan | covered | `server/test/work-plan.test.ts` — second create is refused and persisted plan compares unchanged |
| delta work-plan / Invalid nested creation is atomic | covered | `server/test/work-plan.test.ts` — one invalid child produces no sidecar |
| delta work-plan / Existing task addition remains accepted | covered | `server/test/work-plan.test.ts` and real embedded/RPC sequence — fully specified `add_task` succeeds |
| delta work-plan / Duplicate task identity is rejected atomically | covered | `server/test/work-plan.test.ts` — duplicate ID throws and original plan remains deeply equal |
| delta work-plan / Existing full replacement remains accepted | covered | `server/test/work-plan.test.ts` — prior normalized fixture round-trips unchanged as version 1 |
| delta work-plan / Typed update preserves unspecified fields | covered | `server/test/work-plan.test.ts` — exact task comparison after title-only update |
