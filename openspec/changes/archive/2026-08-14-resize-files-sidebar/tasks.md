## 1. Width State and Persistence

- [x] 1.1 Add shared sidebar-width constants and a pure clamp/parse helper for the 224-pixel minimum, 640-pixel maximum, and 288-pixel default.
- [x] 1.2 Initialize the Files sidebar width from a guarded, namespaced local-storage preference, falling back safely for missing, malformed, denied, and non-finite values.
- [x] 1.3 Persist the final clamped integer width after completed pointer and keyboard resizing without writing on every pointer movement.

## 2. Resize Interaction

- [x] 2.1 Replace the fixed `w-72` sidebar width with the current pixel width while preserving the existing flex behavior and main-content sizing.
- [x] 2.2 Add a right-edge, focusable vertical separator with an enlarged hit area, visible hover/focus/active feedback, pointer capture, and touch-scroll prevention.
- [x] 2.3 Implement horizontal pointer resizing with live width updates, boundary clamping, and cleanup on pointer completion, cancellation, and unmount.
- [x] 2.4 Implement Left Arrow and Right Arrow resizing in 16-pixel steps plus Home reset to 288 pixels, with accurate separator value metadata.

## 3. Verification

- [x] 3.1 Add focused helper tests for defaulting, finite-value parsing, integer normalization, lower/upper clamping, and storage failures.
- [x] 3.2 Add component tests named for every delta-spec scenario, asserting pointer resizing, both bounds, keyboard resizing, restored width, invalid-preference recovery, and main-column preservation.
- [x] 3.3 Enumerate every applicable `components` scenario and record a scenario-to-test matrix with assertion-level coverage.
- [x] 3.4 Run focused UI tests, the full UI suite, typecheck, lint, and strict OpenSpec validation after both resizable panels are complete.
- [x] 3.5 Exercise both features in the running application: manually verify pointer dragging, then use Playwright to resize by keyboard, reach both limits, close/reopen each surface, reload the application, and verify independent stored widths plus remaining main-content/diff widths from the DOM.

## 4. History Split

- [x] 4.1 Extract the width state, pointer lifecycle, keyboard interaction, ARIA metadata, and guarded persistence into a reusable panel-resize primitive without changing the completed Files behavior.
- [x] 4.2 Replace the fixed desktop History commit-list width with its own 416-pixel-default resize instance and a separator between the commit list and diff.
- [x] 4.3 Preserve the existing stacked History layout below the medium breakpoint and hide the inapplicable vertical separator there.
- [x] 4.4 Add History component tests for pointer and keyboard resizing, both bounds, independent preference restoration, responsive classes, and unchanged diff/list navigation behavior.
- [x] 4.5 Extend the scenario-to-test matrix with every new History scenario and assertion-level coverage.
