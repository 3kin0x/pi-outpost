## 1. Contract and Normalization

- [x] 1.1 Add failing schema-contract tests that recursively walk the serialized `work_plan` parameters, reject every unconstrained `{}` operation payload, and require typed action branches, complete bounded create/add/update shapes, declared statuses, nullable clearing values, two task levels, and collection ceilings.
- [x] 1.2 Define reusable typed schemas for bounded creation drafts, normalized tasks/plans, resources, mutable task fields, and every action-specific input while keeping the persisted version-1 model unchanged.
- [x] 1.3 Before normalization work, exercise the exact serialized discriminated union through the embedded SDK and real RPC provider boundary; block later implementation if either boundary rejects or degrades it, and do not fall back to unconstrained fields.
- [x] 1.4 Add failing normalization tests for minimal plans, explicit optional fields, direct subtasks, rejection beyond two levels, unique stable generated IDs, parent relationships, defaults, version `1`, 500-task/64 KiB limits, and all-or-nothing rejection.
- [x] 1.5 Implement bounded draft normalization and collision-resistant ID generation through the existing complete Work Plan validator.

## 2. Agent Operations

- [x] 2.1 Add failing tool tests for `create`, including refusal when a plan exists and an authoritative normalized result with immediately usable generated IDs whose complete serialization remains within 64 KiB.
- [x] 2.2 Implement `create` as an atomic mutation while preserving the semantics of read, clear, add, update, move, remove, dependency, resource, and normalized `replace` operations; update mutation errors so they name `create` and `replace` accurately.
- [x] 2.3 Add regression tests proving previously valid version-1 `replace` payloads and fully specified `add_task` payloads remain accepted, duplicate `add_task` IDs are rejected atomically, typed partial updates preserve unspecified fields, and persisted version remains `1`.
- [x] 2.4 Measure both the recurring serialized tool-schema size and the model-authored argument size for the same plan under typed `replace` and ergonomic `create`; report the first-creation total and multi-turn break-even rather than citing call-size savings alone.

## 3. System Guidance and Runtime Parity

- [x] 3.1 Add failing prompt-composition tests for concise Work Plan guidance when the tool is enabled, omission when disabled, preservation of operator entries, identical embedded/RPC wording, and absence of duplicate behavioral guidance from the tool contract; classify these as composition tests, not evidence of agent behavior.
- [x] 3.2 Extract one capability-aware prompt composition function used by embedded and RPC setup, make its canonical product-owned fragment the sole owner of Work Plan selection/maintenance guidance, and leave only mechanical calling guidance in the tool contract.
- [x] 3.3 Execute `create`, existing `add_task`, typed update, and `get` through a real `pi --mode rpc` child and assert the persisted authoritative plan matches embedded behavior.

## 4. Scenario Coverage and Real-Model Verification

- [x] 4.1 Enumerate every applicable main and delta `#### Scenario:` with `rg '^#### Scenario:' openspec/`, then produce an explicit scenario-to-test matrix whose covered entries cite assertions at the real contract boundary.
- [x] 4.2 Run focused Work Plan, prompt-composition, persistence, RPC, typecheck, and relevant server/UI suites; keep any scenario partial or uncovered until its assertions would fail on a contract regression.
- [x] 4.3 Exercise the running app end to end: ask the agent to create a nested plan, verify the first tool call, persisted sidecar, visible hierarchy, generated IDs, later task update, and resume/read behavior. Driven through a browser against the dev server: the run first exposed a systematic first-call refusal (the model supplies task IDs, which the schema forbade), which is fixed by adopting a supplied ID; the re-run is accepted on the first call and every boundary above is confirmed in the DOM.
- [x] 4.4 Run contemporaneous, interleaved baseline, typed-schema-with-`replace`, and typed-schema-with-`create` arms using Mistral Medium 3.5 with reasoning disabled, 10 fresh sessions per arm; record provider/model version and every captured first call, report the arms separately, and require at least 9/10 accepted first-call creations without a schema-repair loop for the `create` arm before completion.
- [x] 4.5 Treat tasks 1.3, 2.4, and 4.4 as explicit completion gates, then run strict OpenSpec validation and reconcile the Work Plan and scenario matrix before marking the change complete.
