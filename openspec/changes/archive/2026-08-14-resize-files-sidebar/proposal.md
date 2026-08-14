## Why

The Files sidebar and the commit list in file History both have fixed widths, so users cannot reveal long paths and commit subjects or reclaim space for the adjacent content. Resizable boundaries let each user balance navigation, history, chat, and diff content for their window and workspace.

## What Changes

- Add a visible vertical resize handle on the right edge of the open Files sidebar.
- Let users resize the sidebar with pointer input and with an accessible keyboard interaction.
- Constrain the width so the Files tree remains usable without consuming the whole application.
- Persist the user's preferred width locally and restore it when the sidebar or application is reopened.
- Keep the current 288-pixel width as the default when no valid preference exists.
- Apply the same bounded, accessible interaction to the History split between the commit list and diff, retaining its current 416-pixel default.
- Store independent preferences for Files and History so resizing one does not change the other.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `components`: the `Sidebar` workspace-navigation surface and `GitFileHistory` commit-list split become user-resizable, bounded, keyboard-operable, and locally persistent.

## Impact

- UI layout and state: `ui/src/App.tsx`, `ui/src/components/Sidebar.tsx`, `ui/src/components/GitFileHistory.tsx`, and a shared resize primitive.
- UI tests: component and application tests for pointer resizing, keyboard resizing, bounds, responsive layout, independent preferences, and preference restoration.
- Browser storage: two namespaced local preferences; no server, WebSocket protocol, or dependency changes.
