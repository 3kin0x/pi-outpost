## 1. Contract

- [x] 1.1 Replace `workPlanParameters` with one object schema: `action` enum, every other property optional and documented with the actions that use it.
- [x] 1.2 Declare `dependsOn` on the creation task shape.
- [x] 1.3 Add `promptGuidelines` carrying a literal creation call with dependencies and one subtask level, using placeholder titles that cannot be mistaken for plan content.

## 2. Normalization

- [x] 2.1 Accept `dependsOn` in `normalizeWorkPlanDraft`, resolved after the whole draft is read so a forward reference works; keep `parentId` and persistence fields refused by name.
- [x] 2.2 Fold top-level task fields into `changes` for `update_task` when `changes` is absent; an explicit `changes` wins; identity stays unchangeable.

## 3. Tests

- [x] 3.1 Rewrite `publishes a bounded action-specific schema…` for one object schema (no `anyOf` root, `action` enum, every action listed, no unconstrained node).
- [x] 3.2 Split `rejects persistence fields in the ergonomic draft`: `parentId` still refused by name, `dependsOn` now accepted.
- [x] 3.3 Cover creation with dependencies, a forward reference, and an unresolvable dependency refused by name.
- [x] 3.4 Cover the update shapes: fields beside the identifier, explicit `changes` winning, identity refused.
- [x] 3.5 Adapt `fixtures/work-plan-rpc-provider.mjs`, which reads `parameters.anyOf` to enumerate actions.
- [x] 3.6 Assert the tool ships prompt guidelines containing a valid example call.

## 4. Verification

- [x] 4.1 `npm test --workspace server`, `npm run typecheck`, `npm run lint`.
- [x] 4.2 Live: same prompt, same model as the measured failure (`mistral/ministral-8b-latest`), a real server and a real transcript — the refusal must be gone and the dependencies must arrive in the creation call.
- [ ] 4.3 A second live model, to show the result is not one model's habit. *(not run — the first live check was decisive and the second was cut for time)*
- [x] 4.4 The widget, driven by hand: create a plan through the composer and read the Work Plan panel back.

## 5. Review follow-up

- [x] 5.1 Refuse a missing per-action argument by name — dropping the union made `taskId` optional, and four task operations silently no-opped while reporting success.
- [x] 5.2 Refuse an update that carries no changed field.
- [x] 5.3 Point the guidelines at `clear` + `create` rather than `replace`, whose normalized document a small model would have to invent.
- [x] 5.4 Repair `scripts/probe-work-plan-input.mjs`, which read `parameters.anyOf` at module scope.
- [x] 5.5 Document the top-level `title` as the task title an update may carry.
