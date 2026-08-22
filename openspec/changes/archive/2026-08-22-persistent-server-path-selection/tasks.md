## 1. Protocol and durable configuration

- [x] 1.1 Extend the runtime settings snapshot and update request with explicit `skillPaths` and directory-browser request/response types.
- [x] 1.2 Add configuration serialization and UI-managed precedence that validates merged editable settings and atomically persists them without losing unrelated keys.
- [x] 1.3 Change runtime settings application to persist first, retain the live state on failure, and rebuild the session only after a successful write.
- [x] 1.4 Add server tests for persisted sandbox/skill paths, write failure, restart loading, and protocol validation.

## 2. Server-side path browsing

- [x] 2.1 Define and implement the authenticated directory-only browser from `/` with stable errors.
- [x] 2.2 Add tests for root-to-mounted-directory traversal, unreadable paths, and directory-only results.

## 3. Settings experience

- [x] 3.1 Create a reusable Settings path-picker component that browses server directories and reports a selected path through callbacks.
- [x] 3.2 Add editable user skill paths, including add/remove controls, while leaving the configuration file's own `skillPaths` out of the menu and presenting built-in skills as immutable inventory.
- [x] 3.3 Attach the path picker to every current Settings path field, including sandbox root and writable root, and surface apply/persistence errors.
- [x] 3.4 Add component tests for skill-path selection, removal, server-path exploration, and unchanged state after failed apply.

## 4. Integration verification

- [x] 4.1 Exercise the full flow in the running app: browse a mounted skills directory, apply, reload the session, and verify the inventory.
- [x] 4.2 Restart the server from the same configuration and verify the selected paths and skills persist.
- [x] 4.3 Run focused server/UI tests, relevant suites, strict OpenSpec validation, and review the final diff.
