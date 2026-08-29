## 1. Configuration and Protocol

- [x] 1.1 Add and validate `embed.workspaceControls` with `settings` as the default and verify config tests cover every accepted value plus an invalid value.
- [x] 1.2 Carry the effective embed workspace-control policy in session snapshots and acknowledgements, and verify protocol/server snapshot tests observe the configured value without changing standalone workspace behavior.

## 2. Embedded Workspace Controls

- [x] 2.1 Add a compact mono-root header control that shows the current sandbox root, represents locked or unavailable roots honestly, and reuses `ServerPathPicker`; verify focused component tests cover editable, locked, unavailable, select, and cancel states.
- [x] 2.2 Wire `settings`, `root`, and `projects` modes through the embedded App while leaving standalone behavior unchanged; verify UI tests cover all three modes and the `workspaceLock` override.
- [x] 2.3 Route a mono-root selection through the existing complete sandbox update so permissions and locks are preserved, and verify tests prove success rebuilds the same workspace while an incompatible writable root is refused without changing the active root.
- [x] 2.4 Keep Settings, mono-root, and project directory pickers mutually exclusive, and verify interaction tests cannot leave stale browse state or two pickers open.

## 3. Bench and Running-App Proof

- [x] 3.1 Extend the SDK-backed embed bench to expose `settings`, `root`, and `projects` configurations without changing the RPC sandbox restriction, and verify the printed bench links identify each mode.
- [x] 3.2 Exercise each mode in the running embed with Playwright: prove `settings` has no header selector but can edit the sandbox in Settings, `root` persistently replaces one sandbox root without adding a workspace, and `projects` opens and switches projects while `workspaceLock` still suppresses controls.

## 4. Scenario Coverage and Validation

- [x] 4.1 Enumerate every applicable main and delta `#### Scenario:` and write an explicit scenario-to-test matrix with assertion-level evidence; leave no scenario partial or uncovered — `scenario-coverage.md`, 16/16 covered, 0 partial, 0 uncovered. Writing it is what drove the two running-app defects to the surface (the shadow-retargeted outside click, and the shared browse listing released on every press)
- [x] 4.2 Run focused configuration, protocol, component, server, embed, and E2E tests, then the relevant full suites and `openspec validate configure-embed-workspace-controls --strict` — typecheck passed; server 1,563 passed with nothing skipped, coverage gate passed; UI 1,340 passed, coverage 93.36% functions / 87.66% branches / 94.04% lines; Playwright 44/44 passed; strict validation passed. Recorded in `scenario-coverage.md`
