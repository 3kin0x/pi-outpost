## Why

`simplify-work-plan-input` made every Work Plan operation declare its own arguments, as a union of ten action-specific branches. That fixed what the model could *read*. It did not fix what the model is *told when it gets it wrong*, and a union is exactly where that goes bad: pi validates a tool call against the whole schema (`pi-ai/utils/validation.js`), so every branch that fails contributes its own errors.

Measured on a live server against `mistral/ministral-8b-latest`, asked for a five-task plan with two dependencies. The model's first call put `dependsOn` on its creation tasks — the natural way to express a plan that has dependencies, and the way `rpiv-todo` accepts it. It was refused with:

```
Validation failed for tool "work_plan":
  - root: must not have additional properties
  - action: must be equal to constant
  - root: must not have additional properties
  - action: must be equal to constant
  - tasks.2: must not have additional properties
  - plan: must have required properties plan
  - root: must not have additional properties
```

Six of those seven lines describe branches the model never asked for (`action: must be equal to constant` is the `get` branch saying "you are not `get`"). The word `dependsOn` never appears. The model has to guess which of its properties was refused — `normalizeWorkPlanDraft` already carries a comment admitting this. That model guessed right, at the cost of three extra calls; the reported failure is a smaller model at the office (`gemma-4`) that guesses wrong and abandons the plan.

Every refusal also re-echoes `Received arguments: <the whole rejected call>`. Three repair rounds put three copies of a multi-kilobyte plan into a small context window.

## What Changes

- Replace the ten-branch union with **one object schema** whose `action` is an enum and whose per-action arguments are optional properties, each documented with the actions that use it. Per-action requirements stay where they already are — `mutateWorkPlan`, which names the offending field (`tasks[2].dependsOn is not accepted`) instead of enumerating branch failures.
- **Accept `dependsOn` on a creation task**, resolved once the whole draft is read so a task may depend on one declared further down. A dependency naming no task in the plan is refused by the existing graph check, which names it (`unknown dependency: task_1`). `parentId` and persistence fields stay refused: nesting is how creation expresses hierarchy.
- **Fold task fields supplied at the root of `update_task` into `changes`** when `changes` is absent, so `{"action":"update_task","taskId":"t2","status":"done"}` is accepted rather than refused with a message that does not name `status`.
- Give the tool **`promptGuidelines` with a literal example call**, the way `rpiv-todo` does. The tool previously shipped a one-line `promptSnippet` and no example.

## Capabilities

### Modified Capabilities

- `work-plan`: one object schema instead of an action union; refusals name the field they refuse; creation accepts dependencies; `update_task` accepts task fields at the root.

## Impact

- `server/src/workPlanTool.ts` — schema shape, prompt guidelines.
- `shared/src/workPlan.ts` — draft dependencies, root-field folding for `update_task`.
- `server/test/work-plan.test.ts`, `server/test/fixtures/work-plan-rpc-provider.mjs` — two assertions and one fixture read `parameters.anyOf` and assert the union; they encode the previous decision, not behaviour.
- No persisted-plan change: the normalized document, its version, and the sidecar file are untouched. A plan written before this change loads unchanged.
