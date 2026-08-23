## ADDED Requirements

### Requirement: Work Plan protocol state
The typed server protocol SHALL carry the current session Work Plan in authoritative state snapshots and SHALL broadcast accepted Work Plan changes to connected clients. The serialized form SHALL include stable task IDs, hierarchy, status, dependencies, generic resources, and status reason; it SHALL not expose UI-specific markup or domain-specific resource types.

#### Scenario: Snapshot supplies Work Plan
- **WHEN** a client connects to a session with a Work Plan
- **THEN** its initial authoritative state includes that plan

#### Scenario: Change reaches all clients
- **GIVEN** two clients display the same session
- **WHEN** the agent changes the Work Plan
- **THEN** both clients receive the same updated authoritative plan
