## ADDED Requirements

### Requirement: Work Plan client synchronization
The agent client SHALL keep its Work Plan state synchronized with authoritative snapshots and Work Plan change frames. Replacing or switching a session SHALL replace the visible Work Plan with the plan belonging to the newly active session, without retaining tasks from the previous session.

#### Scenario: Switching sessions replaces the plan
- **GIVEN** two sessions with different Work Plans
- **WHEN** the user switches sessions
- **THEN** the client displays only the newly active session's Work Plan
