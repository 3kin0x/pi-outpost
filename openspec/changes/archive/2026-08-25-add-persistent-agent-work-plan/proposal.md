## Why

Pi Outpost currently preserves the conversation and workspace, but neither gives a concise, durable account of the agent's intended work, progress, and unresolved decisions. Long-running work therefore loses its operational context when interrupted and forces the user or agent to reconstruct it from a transcript. The Work Plan is an explicit working-state representation that encourages systematic decomposition, execution tracking, and verification—not merely a progress-reporting mechanism.

## What Changes

- Add an agent-owned Work Plan: a persistent, hierarchical task representation with stable task identifiers, human-readable titles, statuses, dependencies, resource references, and optional status reasons.
- Expose atomic Work Plan mutations to the agent through a structured interface, without prescribing a workflow or deriving progress from tool activity.
- Guide the agent to maintain the Work Plan throughout non-trivial work and reconcile it before declaring the work complete, while avoiding ceremony for trivial interactions.
- Persist the Work Plan with each Pi session, restore it on session reopening, and seed an independently mutable plan when a session is forked.
- Keep Work Plan persistence independent from conversation compaction so the complete current plan remains directly available to the agent after context is summarized.
- Add protocol and client state for live Work Plan snapshots and updates, plus an accessible persistent Work Plan view and task inspection.
- Keep Work Plans distinct from conversation activity and Structured Exchange; task-resource links may reference those artifacts without duplicating them.
- Reserve human steering as a compatible future extension; the initial slice is read-only for users.

## Capabilities

### New Capabilities

- `work-plan`: Agent-driven, session-persistent hierarchical work planning, including the task model, agent operations, lifecycle semantics, and user-facing view.

### Modified Capabilities

- `model`: Extend the typed client/server protocol and snapshot model to transport Work Plan state and updates.
- `agent`: Keep the browser agent state synchronized with authoritative Work Plan snapshots and changes.
- `conversation-tree`: Define the Work Plan copy-and-isolation behavior when a conversation session is forked.

## Impact

- Shared protocol types and WebSocket server dispatch/snapshot handling.
- Agent runtime extensions or tools, session persistence, session switching and forking.
- React `useAgent` state and a new Work Plan UI surface beside the conversation.
- Server, protocol, session-lifecycle, and running-app UI tests.
