## 1. Work Plan domain and persistence

- [x] 1.1 Define shared Work Plan, task, status, dependency, and generic resource contracts with validation limits and stable identities.
- [x] 1.2 Implement an atomic, session-keyed Work Plan store with compatible absent-plan loading and safe persistence.
- [x] 1.3 Add lifecycle operations to load, replace, mutate, delete, and independently copy a plan when a session is forked.
- [x] 1.4 Add unit and integration tests for hierarchy changes, identity stability, validation failures, dependency cycles, persistence, restoration, and fork isolation.
- [x] 1.5 Prove that conversation compaction leaves the persisted plan unchanged and that the agent can still read it directly afterward.

## 2. Agent and protocol integration

- [x] 2.1 Define the agent-facing structured Work Plan operations and expose them consistently through supported runtimes.
- [x] 2.2 Include Work Plan state in initial and session-replacement snapshots and broadcast accepted authoritative changes to all connected clients.
- [x] 2.3 Update WebSocket validation and server dispatch so malformed plan operations cannot partially mutate or persist state.
- [x] 2.4 Test tool operations, multi-client synchronization, session switches, reconnects, and existing-session compatibility.

## 3. Work Plan interface

- [x] 3.1 Extend `useAgent` state and reducer for authoritative Work Plan snapshots, updates, and session replacement.
- [x] 3.2 Build an accessible companion Work Plan overview with hierarchy, distinct statuses, current-focus indication, and progress.
- [x] 3.3 Add task inspection for descriptions, dependencies, status reasons, resources, and resolvable resource navigation.
- [x] 3.4 Add UI tests covering state replacement, task inspection, status presentation, and unavailable-resource behavior.

## 4. End-to-end verification and documentation

- [x] 4.1 Add running-app Playwright coverage that drives agent plan creation and mutation, verifies visible state, reload restoration, session switching, and fork isolation.
- [x] 4.2 Verify both embedded and RPC runtime behavior, or document a supported-runtime limitation before release.
- [x] 4.3 Update user and agent-facing documentation to explain agent ownership, the status vocabulary, persistence behavior, and the read-only initial user experience.
- [x] 4.4 Run the focused and relevant full test suites, strict OpenSpec validation, and a scenario-to-test matrix for every delta scenario.
