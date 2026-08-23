## Context

See `proposal.md` for motivation and measured model behavior. The current tool has one object with an action union and optional operation fields, while `plan`, `task`, and `changes` serialize as empty JSON Schema objects. Runtime validation holds the real contract, so models discover fields through one-error-at-a-time rejection. The persisted version-1 sidecar, UI protocol, compaction independence, and embedded/RPC parity are already shipped and must remain stable.

The tool serves two different needs: ergonomic agent-authored creation and exact manipulation of an authoritative persisted document. Conflating them makes the first call carry storage concerns, while removing the exact form would weaken restore and compatibility behavior.

## Goals / Non-Goals

**Goals:**

- Make the correct shape of every agent operation visible in its schema.
- Make initial plan creation natural and compact for Mistral Medium 3.5 without relying on undocumented storage fields.
- Preserve stable identifiers and return generated identities immediately for subsequent mutations.
- Keep one canonical normalization and validation boundary for embedded and RPC runtimes.
- Add a short, capability-aware system reminder without increasing ceremony for trivial work.
- Demonstrate behavior with real model calls at the running-app boundary, not only direct tool execution.

**Non-Goals:**

- Changing the persisted version-1 Work Plan model, sidecar location, protocol snapshots, UI, limits, or compaction semantics.
- Inferring task completion, dependencies, or resource links from conversation activity.
- Adding user editing, a workflow engine, or project-management integrations.
- Encoding dependencies by task title or array position during ergonomic creation; dependencies remain explicit operations over generated stable IDs.

## Decisions

### Separate ergonomic creation input from the normalized persisted document

Add `create` with `{ title, tasks }`, where each task has a required `title` and optional descriptive fields plus one optional level of `subtasks`. The public schema permits two task levels—tasks and their direct subtasks—and declares `maxItems: 500` on both collections; the existing 500-task and 64 KiB whole-plan limits remain authoritative across the complete hierarchy. Deeper decomposition belongs in task descriptions or a later refinement of the plan, not an operational tree. The finite expansion keeps the shipped JSON Schema portable and tells the model the ceiling before it composes an invalid tree. The server flattens the tree, generates a plan ID and task IDs, assigns parent IDs, supplies version/timestamps/defaults, then passes the result through the existing complete validator before one atomic write.

Existing task-level operations keep their accepted inputs and semantics, but their complete nested shapes become visible in the schema. Dependencies are set after creation through `set_dependencies`, because generated IDs are the stable reference vocabulary.

`create` fails without changing state when a plan already exists; `replace` is the explicit operation for overwriting authoritative state. Requiring models to continue emitting version, timestamps, empty arrays, IDs, and flat parent references was rejected because those fields are persistence mechanics and inflate the creation call. Persisting the nested draft directly was rejected because it would create a second storage model and require a sidecar/protocol migration.

### Keep full replacement as a separate compatibility path

`replace` continues to accept the complete normalized version-1 plan. It remains useful for authoritative restore-style replacement, testing, and callers that already know the persisted shape. It is not the recommended first-call creation path.

Removing or silently redefining `replace` was rejected because the released contract already accepts normalized plans. Treating every creation as replacement was rejected because it reintroduces the hidden-field problem.

### Describe operations as a discriminated union of typed branches

Build one schema branch per action so each branch declares only its required and optional inputs. Reuse shared task, resource, status, update, and normalized-plan schemas to prevent drift between the agent-visible contract and runtime validation. `null` remains the JSON boundary value for clearing nullable optional fields.

Use the discriminated-union representation already exercised successfully through the current Mistral tool boundary. Test the exact serialized union at the embedded and RPC provider boundaries before implementing normalization that depends on it. Unconstrained `Unknown` fields are not an acceptable fallback; if the production schema differs from the tested probe, fix that schema rather than adding a parallel provider-specific contract.

A prose-only example was rejected as the primary fix: it improves one model's prompt but leaves validation invisible to schema-aware tool calling and can drift from code.

### Return the authoritative normalized plan after creation

Successful `create` results include the normalized authoritative plan, not only a task counter. This lets the agent use generated IDs immediately and avoids a mandatory follow-up `get`. The returned plan is subject to the existing 64 KiB serialized-plan limit, so creation cannot produce an unbounded tool result. Existing mutation result behavior remains unchanged because those callers already know the task identities.

Returning only an ID mapping was rejected because the model would still lack normalized defaults and hierarchy state; requiring an immediate `get` was rejected as avoidable tool traffic.

### Generate opaque collision-resistant IDs at the normalization boundary

Plan and task IDs are server-owned, JSON-safe strings generated before validation. The ergonomic input does not accept caller-supplied IDs. Recursive normalization tracks generated parent IDs and rejects invalid nesting or limit violations before persistence. Generated IDs are unique within the candidate plan, stable after creation, and remain unchanged by renames and moves. The compatibility `add_task` path continues to accept a caller-supplied ID and atomically rejects a collision.

Deriving IDs from titles was rejected because renames, duplicate titles, punctuation, and localization would make identity unstable. Array indices were rejected because insertion and reordering would rewrite identity.

### Inject one capability-aware Work Plan reminder

Define one canonical short prompt fragment and one shared composition function used by both embedded and RPC setup. Include the fragment only when `work_plan` is in the effective toolset, place it before operator-configured append entries, and preserve those entries byte-for-byte. The system fragment is the sole owner of when to use, resume, maintain, reconcile, and skip the plan. Tool descriptions and schemas retain only identity and mechanical calling guidance; overlapping behavioral `promptGuidelines` are removed.

Relying only on tool description/guidelines was rejected because tool availability does not guarantee selection after long context or compaction. A long tutorial in the system prompt was rejected because it adds recurring context cost and duplicates the schema.

### Gate completion on deterministic contracts and sampled real-model behavior

Unit tests recursively walk the serialized schema and fail on any unconstrained `{}` operation payload rather than checking a hand-maintained list of paths. They also assert normalization produces valid canonical version-1 plans, compatibility paths remain valid, creation refuses to overwrite an existing plan, duplicate `add_task` IDs are atomic, and invalid trees are atomic. Runtime tests execute the real tool in embedded and real RPC children. Running-app tests create and update a plan, then verify the sidecar/UI/transcript boundary. Prompt string tests prove composition ownership and parity only; agent selection behavior is evidenced at the running-model boundary.

In addition, run contemporaneous, interleaved arms with Mistral Medium 3.5 and reasoning disabled: the shipped unconstrained baseline, a typed schema using `replace` without ergonomic creation, and the typed schema using `create`. Run 10 fresh sessions per arm and retain every first call. A candidate trial passes only when its first `work_plan` call is accepted and creates the requested hierarchy without a schema-repair loop; the `create` arm must pass at least 9/10 trials before completion. Report each arm rather than attributing the typed-schema gain to `create`. Measure serialized tool-schema size and model-authored call size for the same plan so the recurring schema cost and one-time creation savings are both visible; retain `create` as an ergonomic design decision, not as a causal conclusion from the earlier 3/3 probe.

## Risks / Trade-offs

- [The production action union may differ from the successful Mistral probe] → Exercise the exact shipped schema through the current Mistral runtime and fix any incompatibility at the shared schema boundary.
- [Nested task schemas may consume excessive prompt tokens] → Ship only tasks plus one subtask level, declare collection ceilings, test the exact serialized tree at both provider boundaries, and measure its recurring size.
- [Generated IDs make creation output larger] → Return the authoritative plan only for `create` and keep the existing 64 KiB plan cap.
- [System guidance duplicates tool guidelines] → Make the system fragment the sole behavioral owner, remove overlapping tool guidelines, and test the shared prompt composition rather than independent prose.
- [Stochastic model probes can fluctuate] → Use multiple fresh sessions, pin provider/model/reasoning settings, retain captured first calls, and keep deterministic schema/normalization tests as the CI contract.

## Migration Plan

1. Introduce shared typed schemas and prove the exact serialized discriminated union at embedded and RPC provider boundaries while leaving the persisted version-1 validator unchanged.
2. Add bounded draft normalization and `create` while retaining the semantics of existing mutations and full `replace` compatibility.
3. Replace unconstrained tool parameters with the provider-proven action-specific typed branches in both embedded and RPC registration paths.
4. Add capability-aware system guidance through the shared runtime prompt composition.
5. Run deterministic suites, real RPC execution, running-app behavior, and the recorded Mistral trials before declaring the change complete.

Rollback removes the ergonomic creation operation and prompt fragment while continuing to read every persisted sidecar produced by the change. An explicit regression assertion proves that creation writes the unchanged version-1 representation, so rollback requires no data migration.
