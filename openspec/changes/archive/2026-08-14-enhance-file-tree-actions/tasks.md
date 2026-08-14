## 1. Protocol and server operations

- [x] 1.1 Extend the shared WebSocket protocol with correlated native-open, rename, delete, and move file messages, acknowledgements, and file-browser error reasons.
- [x] 1.2 Implement symlink-safe, browser-root-confined native opening for regular files using the platform launcher without a shell, with focused success and refusal tests.
- [x] 1.3 Implement permissioned rename and deletion of regular files, including name validation, collision prevention, notifications, and focused server tests.
- [x] 1.4 Implement permissioned file-to-directory moves with destination collision checks, source/destination refresh notifications, and focused server tests.
- [x] 1.5 Route all lifecycle messages through the WebSocket server and test correlated success, error, confinement, and writable-zone behavior at the protocol boundary.

## 2. File tree interaction

- [x] 2.1 Extend `FileTree` props and rendering with accessible native-open, rename, and delete controls that respect the existing hover and touch conventions.
- [x] 2.2 Add in-tree rename editing with cancel, submission, and server-error recovery behavior; synchronize the open viewer when its file is renamed.
- [x] 2.3 Add a file-named deletion confirmation flow that sends no request on cancellation and closes/refreshes affected UI after confirmed success.
- [x] 2.4 Add file-row drag-and-drop onto writable directory rows, reject invalid destinations, and connect a successful move to tree and viewer refreshes.
- [x] 2.5 Add component and application tests covering lifecycle callbacks, confirmation, valid and invalid drops, read-only native opening, and error recovery.
- [x] 2.6 Automatically attach selected `.docx` and `.xlsx` binary-preview failures as path references, while leaving unsupported binary formats unattached.
- [x] 2.7 Add complete-name hover tooltips to truncated file and directory labels using the Git tree convention.

## 3. End-to-end verification

- [x] 3.1 Enumerate every scenario in the `file`, `api`, and `components` delta specs and record a scenario-to-test matrix with assertion-level coverage.
- [x] 3.2 Run focused server and UI test suites, then the relevant workspace suites and strict OpenSpec validation.
- [x] 3.3 Exercise native opening, rename, confirmed deletion, and drag-and-drop move in the running application with Playwright; verify resulting DOM and filesystem state, including a rejected action.
- [x] 3.4 Exercise drag-and-drop from a genuinely read-only file into a writable directory; verify that the destination is created and the source remains.
- [x] 3.5 Exercise `.docx`/`.xlsx` automatic attachment and long-name tooltips in the running application.
