## ADDED Requirements

### Requirement: Forked Work Plan isolation
When the user forks a session, the new session SHALL begin with a copy of the Work Plan state applicable at the fork point. Subsequent Work Plan mutations in either session SHALL be independent and SHALL NOT modify the other session's plan.

#### Scenario: Fork preserves then isolates work
- **GIVEN** a session with an existing Work Plan
- **WHEN** the user forks the session
- **THEN** the fork initially shows the copied plan
- **AND** changing a task in the fork does not change that task in the original session
