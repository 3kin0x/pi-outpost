## Context

`Sidebar` currently owns the Files surface and renders as a fixed `w-72` flex child beside the main application column. `GitFileHistory` similarly renders its commit list as `md:w-[26rem]` beside the diff, while retaining a stacked layout below the medium breakpoint. The change is entirely client-side and must work in both standalone and embedded layouts without adding protocol state; see `proposal.md` and the `components` delta spec.

## Goals / Non-Goals

**Goals:**

- Keep resizing local to the Files and History boundaries and preserve their existing flex layouts.
- Support mouse, pen, touch, and keyboard input through one accessible separator.
- Restore a safe preferred width without allowing malformed storage data to break rendering.
- Make the resizing contract directly testable at the component and running-application boundaries.

**Non-Goals:**

- Resizing the right-side session-analysis panel or other overlays beyond the History commit-list split.
- Synchronizing the width between browsers, devices, users, or server sessions.
- Adding a general-purpose split-pane dependency or changing the WebSocket protocol.
- Changing the existing open/closed sidebar preference.

## Decisions

### Share the resize interaction while each panel owns its width

Extract a small reusable width hook and separator component parameterized by label, bounds, default, step, and storage key. `Sidebar` and `GitFileHistory` each own an instance and replace their fixed desktop width utility with the returned inline pixel width. This keeps the high-frequency interaction out of `App` while avoiding two subtly different pointer implementations.

Alternative: own both widths in `App` and pass them down. This would expose state values that no sibling needs and couple the application orchestrator to local presentation concerns. Duplicating the handlers in both panels would make pointer cancellation, ARIA metadata, and persistence prone to drift.

### Use a native ARIA separator with pointer events

Render a focusable `role="separator"` at each resizable right edge with vertical orientation and current/minimum/maximum value metadata. Pointer capture keeps a drag active if the pointer leaves the narrow handle, while `touch-action: none` prevents a touch drag from becoming page scrolling. Left Arrow and Right Arrow adjust by a fixed 16-pixel step; Home restores that panel's default.

Alternative: mouse-only document listeners. They exclude touch and keyboard users and make cleanup after unmount or lost pointer events more fragile.

### Clamp at every input boundary

Use one pure clamp function for initial storage reads, pointer-derived widths, and keyboard changes. Both panels use 224–640 pixels; Files defaults to 288 pixels and History to its existing 416 pixels. This keeps navigation usable at the low end and prevents either list from taking over a typical desktop window at the high end.

Alternative: express the maximum only as a viewport percentage. That makes the saved preference unstable as the host resizes and complicates deterministic keyboard and component tests. The surrounding flex layout will continue to give the main column all remaining space.

### Persist only valid numeric widths in namespaced local storage

Store each final clamped integer width under a distinct pi-outpost-specific key after a pointer resize completes and after each keyboard adjustment. Initialization reads defensively: absent or non-numeric values use the panel-specific default, and finite numeric values are clamped. Storage access is wrapped because embedded hosts or privacy policies can deny it.

Alternative: persist on every pointer move. That creates unnecessary synchronous storage writes during a high-frequency interaction without improving restoration behavior.

### Keep History responsive below the medium breakpoint

Apply the stored History width only to the existing side-by-side desktop layout. Below the medium breakpoint, retain the current full-width, maximum-40%-height commit list above the diff and hide the vertical separator through the same responsive boundary. The saved desktop preference remains untouched and returns when the layout becomes side by side again.

Alternative: make the stacked split vertically resizable. That is a different interaction with different bounds and was not requested.

## Risks / Trade-offs

- [A 640-pixel sidebar can leave little chat space in a narrow host] → The main column retains `min-width: 0`, the resize value remains bounded, and running-app coverage will exercise a constrained viewport; responsive auto-collapse is outside this change.
- [Pointer capture APIs differ in test DOMs] → Keep width calculation and clamping pure, component-test event wiring, and verify an actual drag in the running application.
- [Browser storage can throw or contain stale data] → Guard reads and writes and fall back to a safe width without surfacing an application error.
- [A narrow visual divider can be hard to target] → Give the separator a wider transparent hit area with visible hover and focus feedback while keeping the visual boundary subtle.
- [An inline History width can override responsive full-width stacking] → Apply it through a desktop-only CSS custom property/class and explicitly keep `width: 100%` in the narrow layout.

## Migration Plan

No data or protocol migration is required. Existing users start at 288 pixels for Files and 416 pixels for History until they resize. Rollback removes the handles and ignores the harmless namespaced storage keys.
