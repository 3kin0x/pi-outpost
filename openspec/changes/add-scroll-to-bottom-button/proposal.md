## Why

When a reader moves up through a long or streaming conversation, returning to the newest message requires manually dragging or scrolling through the entire transcript. The application already knows when the reader has left its near-bottom region, so it can offer a direct return without changing the existing scrollback protection.

## What Changes

- Show a floating scroll-to-bottom control at the bottom of the conversation viewport whenever the reader is outside the existing near-bottom region.
- Hide the control while the conversation is already near the bottom, including after activating it.
- Scroll to the end of the current conversation when the control is activated, without sending, editing, or otherwise changing conversation content.
- Keep the control reachable by keyboard and named for assistive technology.
- Preserve the existing behavior that new streamed content auto-scrolls only while the reader remains near the bottom.

## Capabilities

### New Capabilities

- `conversation-scroll-navigation`: Visibility, activation, accessibility, and interaction with existing conversation auto-scroll behavior for a direct return-to-latest control.

### Modified Capabilities

None.

## Impact

- Conversation viewport ownership and scroll-state handling in `ui/src/App.tsx`.
- UI component tests for scroll position, visibility, activation, and existing streaming behavior.
- Running-app Playwright coverage for the real scroll container and fixed positioning above the composer.
- No server, protocol, persistence, dependency, or compatibility changes.
