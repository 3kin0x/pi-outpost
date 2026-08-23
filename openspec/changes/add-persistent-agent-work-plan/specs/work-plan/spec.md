## Purpose

Provides an agent-owned, human-readable account of the current work that survives session interruption without becoming a workflow engine.

## ADDED Requirements

### Requirement: Agent-owned hierarchical Work Plan
The system SHALL represent an optional Work Plan for a session as a title and a hierarchy of tasks. Every task SHALL have a stable identifier, a human-readable title, one of `todo`, `in_progress`, `done`, `blocked`, or `needs_review`, and optional description, parent, dependencies, generic resource references, and status reason. The hierarchy SHALL allow arbitrary depth; task identity SHALL survive renaming and moving.

#### Scenario: Progressive decomposition
- **WHEN** the agent adds children to an existing task
- **THEN** the plan shows the parent and its newly decomposed children without changing the parent's identity

#### Scenario: Blocked work is explained
- **WHEN** the agent marks a task `blocked` with a reason
- **THEN** the plan distinguishes it from `needs_review` and shows the reason during inspection

### Requirement: Structured agent management
The system SHALL expose structured operations for the agent to create a plan, add, edit, move, remove, and reopen tasks, set status and status reason, add or remove dependencies and resource references, and replace the plan. Each accepted operation SHALL be atomic. The system SHALL describe the Work Plan to the agent as explicit working state for systematic decomposition, execution tracking, and verification, not merely progress reporting. For non-trivial work, it SHALL guide the agent to maintain and reconcile that state before declaring completion; trivial interactions SHALL NOT require a plan. The system SHALL NOT infer task state or completion from tool calls, messages, or Structured Exchange artifacts.

#### Scenario: Atomic task update
- **WHEN** an agent operation is invalid
- **THEN** no partial Work Plan mutation becomes visible or persisted

#### Scenario: Activity does not complete work
- **WHEN** the agent performs tools while a task remains `in_progress`
- **THEN** the task remains `in_progress` until the agent explicitly changes it

#### Scenario: Reconcile before completion
- **GIVEN** the agent used a Work Plan for non-trivial work
- **WHEN** the agent is preparing to declare that work complete
- **THEN** its Work Plan guidance requires the agent to reconcile the plan with execution and verification outcomes first

### Requirement: Session-scoped persistence and restoration
The system SHALL persist the Work Plan with its owning session and restore it when that session is reopened. A restored plan SHALL preserve task hierarchy, identities, statuses, dependencies, resources, and reasons, and SHALL be available to the resumed agent as compact operational context.

#### Scenario: Resume interrupted work
- **GIVEN** a saved session with a task in progress and remaining tasks
- **WHEN** the session is reopened
- **THEN** the same Work Plan is shown and supplied to the agent

### Requirement: Compaction-independent working state
Work Plan persistence SHALL be independent from Pi conversation compaction. Compaction of conversational context SHALL NOT remove, summarize, alter, or invalidate the persisted Work Plan. Following compaction, the current Work Plan state SHALL remain directly accessible to the agent through the structured Work Plan interface without reconstructing it from the compacted conversation summary.

#### Scenario: Compaction preserves the plan
- **GIVEN** a session with a persisted Work Plan
- **WHEN** Pi compacts the session's conversational context
- **THEN** the complete persisted Work Plan remains unchanged and valid

#### Scenario: Agent reads the plan after compaction
- **GIVEN** Pi has compacted a session that has a Work Plan
- **WHEN** the agent reads the current Work Plan through the structured interface
- **THEN** it receives the authoritative current state without using or reconstructing information from the conversation summary

### Requirement: Work Plan view and inspection
The system SHALL provide a persistent or readily accessible Work Plan view alongside the conversation. It SHALL make task status, hierarchy, current focus, and aggregate progress understandable without reading the transcript. Selecting a task SHALL reveal its description, children, dependencies, reason, resources, and associated activity or outputs when available.

#### Scenario: Readable overview
- **WHEN** a session has completed, active, blocked, and review tasks
- **THEN** the overview makes every state and the current focus distinguishable

#### Scenario: Preview a collapsed plan
- **GIVEN** the Work Plan detail panel is collapsed
- **WHEN** the user hovers or focuses its progress control
- **THEN** a compact summary shows task lines and completion boxes, and selecting the control opens the full detail panel

#### Scenario: Navigate a resource
- **GIVEN** a task references a resource the system can resolve
- **WHEN** the user selects that resource
- **THEN** the system navigates to it using the existing applicable UI
