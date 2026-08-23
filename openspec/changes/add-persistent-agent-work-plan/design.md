## Context

See proposal.md for motivation. Pi Outpost has one authoritative server-side session shared by connected clients, a typed WebSocket protocol, and saved/forked Pi sessions. The Work Plan must become a third persistent representation while remaining independent of transcript activity and Structured Exchange.

## Goals / Non-Goals

**Goals:**
- Store a small, versionable plan document per session and make it available to both agent and UI.
- Preserve plan ownership boundaries: the agent mutates intent; the server validates and persists it; the UI renders it.
- Copy plan state at a session fork and avoid cross-branch mutation.

**Non-Goals:**
- A workflow engine, automatic task completion, user editing, project-management integrations, or domain-specific resource schemas.
- Full historical provenance or automatic activity-to-task association; the model leaves extension points for both.

## Decisions

### A separate session sidecar owns Work Plan persistence
Persist a versioned Work Plan document adjacent to, and keyed by, the Pi session rather than embedding UI state in transcript messages. This permits atomic writes, restores without replaying a transcript, and independent fork copies. A per-server global plan was rejected because it breaks session isolation; transcript-only encoding was rejected because it couples progress to conversation history and branch navigation.

Because the sidecar is neither a transcript entry nor derived by replaying transcript content, Pi compaction cannot summarize, mutate, or invalidate it. After compaction, the same structured `get` operation reads the authoritative sidecar directly; the agent never has to reconstruct planning state from the compaction summary.

### Agent mutations use a narrow structured tool surface
Expose plan replacement and validated task-level mutations through the runtime's agent-facing capability, then broadcast the resulting complete authoritative plan. The capability describes the plan as operational working state: for non-trivial work the agent maintains it during decomposition, execution, and verification, then reconciles it before reporting completion. Trivial interactions need no plan. A generic JSON patch endpoint was rejected: it weakens invariants such as unique IDs, parent/child consistency, and dependency validation.

### Snapshot replacement is the synchronization contract
The protocol carries a full Work Plan in initial and session-replacement snapshots, with accepted changes broadcast as a complete plan. This makes reconnection and session switches deterministic and avoids client-side operation replay. Optimistic client editing is unnecessary because the initial UI is read-only.

### The first UI is a task-focused companion panel
Use a persistent/collapsible companion surface with status icons, nesting, focus indication, progress, and inspection. It links generic references only through existing resolvers. This prioritizes the operational overview over a project-management experience.

## Risks / Trade-offs

- [Sidecar lifecycle may diverge from session lifecycle] → Use the same canonical session identity/path and fork/switch/delete hooks; test each lifecycle operation.
- [A plan can become very large] → Cap the complete serialized plan at 64 KiB so a post-compaction `get` cannot refill the model context; also bound titles, descriptions, resources, and task counts.
- [Agent tool availability differs between embedded and RPC runtimes] → Define one runtime capability contract and execute `work_plan` through a real `pi --mode rpc` child before claiming parity.
- [Dependencies can form cycles] → Reject self-dependencies and cycles atomically.

## Migration Plan

1. Introduce an absent-plan-compatible protocol and sidecar loader; existing sessions continue with no plan.
2. Add agent operations, persistence, fork copying, and snapshots behind the compatible model.
3. Add the read-only UI and running-app tests.
4. Rollback by ignoring/removing the feature; existing conversation sessions remain valid and sidecar files can be retained for a future re-enable.
