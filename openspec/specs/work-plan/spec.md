# Work Plan Specification

## Purpose

Provides an agent-owned, human-readable account of the current work that survives session interruption without becoming a workflow engine.

## Requirements

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

### Requirement: Self-describing Work Plan tool contract
The structured Work Plan interface SHALL expose a single object schema whose `action` property enumerates every operation and whose remaining properties are optional, individually typed, and documented with the actions that use them. Every nested input field, accepted status, and nullable clearing value SHALL be declared. An agent SHALL be able to construct a valid call from the tool name, description, schema, and prompt guidelines without learning required fields from rejected mutations. A refused call SHALL be answered with a diagnosis that names the refused field, and SHALL NOT enumerate the failures of operations the call did not request.

#### Scenario: Creation schema declares its complete input
- **WHEN** an agent inspects the Work Plan tool schema
- **THEN** the schema declares the plan title and the recursively nested task shape, including the task dependency list
- **AND** no creation field is hidden behind an unconstrained schema object

#### Scenario: Mutation branches require their own arguments
- **WHEN** an agent inspects any operation-specific argument
- **THEN** the schema declares which actions require it
- **AND** it is not presented as a requirement of unrelated actions

#### Scenario: A refusal names the field it refuses
- **WHEN** a call carries a property the requested action does not accept
- **THEN** the diagnosis names that property and its path within the call
- **AND** it does not report the requirements of operations the call did not request

#### Scenario: Clearing optional values is discoverable
- **WHEN** an operation can clear an optional parent, description, or status reason
- **THEN** its schema declares the accepted JSON `null` value for that field

#### Scenario: The tool carries a worked example
- **WHEN** the agent's prompt is composed
- **THEN** the Work Plan tool contributes guidelines containing a literal, valid creation call with dependencies and one level of subtasks

### Requirement: Normalized hierarchical creation
The Work Plan interface SHALL provide a creation operation that accepts a human-readable plan title, top-level tasks, and at most one level of direct subtasks. Each task collection SHALL declare a maximum of 500 items, while the existing limit of 500 total tasks and 64 KiB for the complete serialized plan SHALL remain authoritative. Each input task SHALL require only a human-readable title; description, status, status reason, resources, dependencies, and direct subtasks SHALL be optional. Subtasks SHALL NOT themselves accept subtasks. Each input task MAY carry its own identifier; the operation SHALL adopt a supplied identifier as the task's stable identity, SHALL reject a collection whose supplied identifiers are not unique, and SHALL generate an identifier for every task that omits one. A supplied dependency list SHALL be resolved against the identifiers of the complete draft, in any declaration order, and a dependency naming no task in the draft SHALL be refused by name. The ergonomic input SHALL NOT accept a parent identifier or any other persistence field: nesting is how creation expresses hierarchy. The server SHALL atomically normalize accepted input into the persisted Work Plan representation by generating the unique stable plan identifier and the omitted task identifiers, setting the unchanged plan version `1` and update timestamp, defaulting omitted statuses to `todo`, initializing omitted dependency and resource collections, and translating nesting into parent relationships.

#### Scenario: Create a minimal plan
- **WHEN** the agent creates a plan with a title and tasks that contain only titles
- **THEN** the operation persists a valid versioned plan whose tasks have stable identifiers, `todo` status, and empty dependency and resource collections

#### Scenario: Create direct subtasks
- **WHEN** a creation input contains direct subtasks under top-level tasks
- **THEN** the persisted plan preserves that two-level hierarchy with generated parent relationships

#### Scenario: A plan is created with its dependencies
- **WHEN** a creation task supplies a dependency list naming other tasks in the same call
- **THEN** the persisted plan carries those dependencies without any further operation

#### Scenario: A dependency may name a task declared later
- **WHEN** a creation task depends on a task that appears further down the same input
- **THEN** the dependency resolves and the plan is persisted

#### Scenario: An unresolvable dependency is refused by name
- **WHEN** a creation task depends on an identifier no task in the input carries
- **THEN** the operation is rejected, the diagnosis names that identifier, and no plan becomes persisted

#### Scenario: The agent names its own tasks
- **WHEN** a creation input supplies an identifier for some of its tasks
- **THEN** each supplied identifier becomes that task's stable identity, addressable by a later task operation without an intervening read
- **AND** every task that omitted an identifier receives a generated one

#### Scenario: Duplicate supplied identity is rejected atomically
- **WHEN** a creation input supplies the same identifier for two tasks
- **THEN** the operation is rejected and no plan becomes persisted

#### Scenario: Creation limits are discoverable and atomic
- **WHEN** the agent inspects or submits a creation input
- **THEN** the schema declares the two-level nesting and per-collection ceilings
- **AND** input exceeding a declared or whole-plan limit is rejected without changing persisted state

#### Scenario: Explicit task fields survive normalization
- **WHEN** a creation task supplies an allowed status, description, status reason, or resources
- **THEN** the normalized task preserves those values and generates only the omitted technical fields

#### Scenario: Persistence mechanics stay out of the creation input
- **WHEN** a creation task supplies a parent identifier or another persistence field
- **THEN** the operation is rejected and the diagnosis names that field

#### Scenario: Creation returns usable task identities
- **WHEN** a creation operation succeeds
- **THEN** its result supplies the normalized authoritative plan, including generated task identifiers, so later task-level operations need no additional discovery call
- **AND** the complete returned plan is bounded by the existing 64 KiB serialized-plan limit

#### Scenario: Creation does not overwrite an existing plan
- **GIVEN** the session already has a persisted Work Plan
- **WHEN** the agent submits a creation operation
- **THEN** the operation is rejected without changing the existing plan
- **AND** the full replacement operation remains the explicit overwrite path

#### Scenario: Invalid nested creation is atomic
- **WHEN** any task in a nested creation input is invalid or would exceed a Work Plan limit
- **THEN** no part of the new plan becomes visible or persisted

### Requirement: Compatible fine-grained mutations
After creation, the Work Plan interface SHALL retain its existing operations to read and clear the plan; add, update, move, and remove tasks; set dependencies and resources; and replace the complete normalized plan. Each operation SHALL expose its complete typed input without changing its accepted mutation semantics. Full replacement SHALL continue accepting the existing version-1 persisted Work Plan representation.

#### Scenario: Existing task addition remains accepted
- **GIVEN** a fully specified task input accepted before this change
- **WHEN** the agent submits it through the task-addition operation
- **THEN** the system accepts it without requiring the ergonomic creation shape

#### Scenario: Duplicate task identity is rejected atomically
- **GIVEN** an existing plan contains a task identifier
- **WHEN** the agent submits a fully specified task with the same identifier through the task-addition operation
- **THEN** the operation is rejected without changing the plan

#### Scenario: Existing full replacement remains accepted
- **GIVEN** a valid normalized version-1 Work Plan accepted before this change
- **WHEN** the agent submits it through the full replacement operation
- **THEN** the system accepts it without requiring migration to the ergonomic creation shape
- **AND** its persisted representation remains version `1`

#### Scenario: Typed update preserves unspecified fields
- **GIVEN** an existing task
- **WHEN** the agent updates one schema-declared mutable field
- **THEN** every unspecified task field keeps its current value

### Requirement: Missing operation arguments are refused by name
Because the schema declares every operation-specific argument as optional, the server SHALL check each operation's own requirements and SHALL refuse a call that omits one, naming the action and the missing argument. An operation that names a task SHALL refuse a call carrying no task identifier rather than resolving no task and reporting success. An update SHALL refuse a call that changes nothing.

#### Scenario: An operation that names a task refuses to run without one
- **WHEN** a task update, move, removal, dependency assignment, or resource assignment is submitted with no task identifier
- **THEN** the operation is rejected, the diagnosis names the action and the missing argument, and the persisted plan is unchanged
- **AND** the caller is not told the operation succeeded

#### Scenario: A payload-carrying operation refuses to run empty
- **WHEN** a creation, replacement, or task addition is submitted without its plan, title, tasks, or task argument
- **THEN** the operation is rejected and the diagnosis names the missing argument

#### Scenario: An update that changes nothing is refused
- **WHEN** a task update names a task but carries no changed field, in `changes` or beside the identifier
- **THEN** the operation is rejected rather than persisting an unchanged plan

### Requirement: Forgiving task update shape
The task update operation SHALL accept its changed fields either inside a `changes` object or directly alongside the task identifier. When no `changes` object is supplied, the server SHALL treat the task fields present at the top level of the call as the requested changes. A call that supplies both SHALL use `changes`. Task identity SHALL remain unchangeable through either shape.

#### Scenario: Changed fields are accepted beside the task identifier
- **WHEN** an update names a task identifier and a status with no `changes` object
- **THEN** the operation applies that status to the named task

#### Scenario: An explicit changes object still wins
- **WHEN** an update supplies both a `changes` object and top-level task fields
- **THEN** the operation applies the `changes` object

#### Scenario: Identity cannot be changed through either shape
- **WHEN** an update supplies a task identifier as a changed field
- **THEN** the operation is rejected
