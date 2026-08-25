## ADDED Requirements

### Requirement: Self-describing Work Plan tool contract
The structured Work Plan interface SHALL expose an action-specific schema in which every nested input field, required field, accepted status, and nullable clearing value is declared. An agent SHALL be able to construct a valid call from the tool name, description, and schema without learning required fields from rejected mutations. The schema SHALL distinguish operations that read or clear state from operations that create, replace, or mutate state.

#### Scenario: Creation schema declares its complete input
- **WHEN** an agent inspects the Work Plan tool schema
- **THEN** the creation branch declares the plan title and recursively nested task shape
- **AND** no required creation field is hidden behind an unconstrained schema object

#### Scenario: Mutation branches require their own arguments
- **WHEN** an agent inspects a task mutation branch
- **THEN** the schema declares the task identifier and the operation-specific payload required by that branch
- **AND** fields for unrelated actions are not presented as requirements of that branch

#### Scenario: Clearing optional values is discoverable
- **WHEN** an operation can clear an optional parent, description, or status reason
- **THEN** its schema declares the accepted JSON `null` value for that field

### Requirement: Normalized hierarchical creation
The Work Plan interface SHALL provide a creation operation that accepts a human-readable plan title, top-level tasks, and at most one level of direct subtasks. Each task collection SHALL declare a maximum of 500 items, while the existing limit of 500 total tasks and 64 KiB for the complete serialized plan SHALL remain authoritative. Each input task SHALL require only a human-readable title; description, status, status reason, resources, and direct subtasks SHALL be optional. Subtasks SHALL NOT themselves accept subtasks. Each input task MAY carry its own identifier; the operation SHALL adopt a supplied identifier as the task's stable identity, SHALL reject a collection whose supplied identifiers are not unique, and SHALL generate an identifier for every task that omits one. The ergonomic input SHALL NOT accept a plan identifier or any other persistence field. The server SHALL atomically normalize accepted input into the persisted Work Plan representation by generating the unique stable plan identifier and the omitted task identifiers, setting the unchanged plan version `1` and update timestamp, defaulting omitted statuses to `todo`, initializing omitted dependency and resource collections, and translating nesting into parent relationships.

#### Scenario: Create a minimal plan
- **WHEN** the agent creates a plan with a title and tasks that contain only titles
- **THEN** the operation persists a valid versioned plan whose tasks have stable identifiers, `todo` status, and empty dependency and resource collections

#### Scenario: Create direct subtasks
- **WHEN** a creation input contains direct subtasks under top-level tasks
- **THEN** the persisted plan preserves that two-level hierarchy with generated parent relationships

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
