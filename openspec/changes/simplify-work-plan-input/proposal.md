## Why

The Work Plan tool currently exposes the nested `plan`, `task`, and `changes` inputs as unconstrained JSON Schema objects, leaving required fields, accepted statuses, and hierarchy encoding invisible to the model. In a real Mistral Medium 3.5 session this caused four rejected creation attempts before success. A small controlled probe produced valid first calls in 3/3 trials with an explicit schema and 3/3 with a simplified creation input, versus 0/3 with the current contract. This identifies the unconstrained schema as the measured root cause; it establishes feasibility, but is not large enough to attribute an additional reliability benefit to simplified creation.

## What Changes

- Add an ergonomic `create` operation that accepts a plan title and a bounded hierarchy of outcome-oriented tasks, reducing storage mechanics and repeated metadata in the model-authored payload.
- During ergonomic creation, generate persistence mechanics such as plan/task identifiers, schema version, timestamps, default `todo` statuses, and empty dependency/resource collections on the server.
- Expose action-specific, fully typed JSON Schema for every Work Plan operation instead of hiding nested contracts behind unconstrained objects.
- Preserve the complete persisted Work Plan representation and the existing fine-grained operations used after creation, including task updates, moves, dependencies, resources, replacement, reading, and clearing.
- Add one concise product-owned system-prompt reminder that tells agents when to create and maintain a Work Plan without requiring plans for trivial interactions; keep behavioral selection guidance out of the tool-owned prompt guidelines.
- Verify schema acceptance, first-call behavior, and the schema-versus-call token trade-off with contemporaneous Mistral Medium 3.5 arms at the current running-app boundary.
- Treat `replace` as a full-fidelity operation for an already normalized Work Plan; callers using it remain compatible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-plan`: Refine the agent-facing creation and mutation contract with nested ergonomic creation, server normalization, and explicit action-specific schemas.
- `agent`: Extend the product-owned system-prompt context with concise Work Plan selection and maintenance guidance while preserving operator-configured prompt entries.

## Impact

- Work Plan tool schemas and execution in `server/src/workPlanTool.ts`.
- Work Plan input normalization, validation, and persisted model handling in `shared/src/workPlan.ts` and `server/src/workPlanStore.ts`.
- Shared system-prompt composition used by the embedded and RPC agent runtimes.
- Unit, runtime-parity, prompt-composition, and running-app model-behavior tests.
- No persisted sidecar migration and no UI protocol change are expected; normalized plans retain the current versioned representation.
