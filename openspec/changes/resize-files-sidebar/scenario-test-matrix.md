# Scenario-to-test matrix

All delta scenarios and the existing workspace-navigation scenarios applicable to the changed `Sidebar` boundary are covered. Coverage is based on the assertions in each test, not its title alone.

## Delta scenarios

| Capability | Scenario | Status | Test file and test name | Contract asserted |
|---|---|---|---|---|
| components | Resize with pointer input | covered | `ui/src/components/Sidebar.test.tsx` — `Resize with pointer input: follows the horizontal pointer and commits only when the drag ends`; `ui/src/App.test.tsx` — `keeps the main column flexible while the Files sidebar is resized` | Horizontal pointer delta updates the inline sidebar width while storage remains untouched until pointer completion, and the adjacent main column retains its flexible, shrinkable layout. |
| components | Enforce resizing bounds | covered | `ui/src/components/Sidebar.test.tsx` — `Enforce resizing bounds: clamps pointer movement at both boundaries` | Pointer movement beyond both ends produces exactly 224 and 640 pixels rather than an out-of-range width. |
| components | Resize with the keyboard | covered | `ui/src/components/Sidebar.test.tsx` — `Resize with the keyboard: changes by one step, resets with Home, and updates ARIA` | Right/Left Arrow change width by 16 pixels, Home restores 288 pixels, the stored value is updated, and `aria-valuenow` tracks the rendered width. |
| components | Restore the preferred width | covered | `ui/src/components/Sidebar.test.tsx` — `Restore the preferred width: restores a completed resize after remounting` | A keyboard resize is persisted and a newly mounted sidebar initializes at the saved width. |
| components | Recover from an invalid stored preference | covered | `ui/src/components/Sidebar.test.tsx` — `Recover from an invalid stored preference: defaults malformed values and clamps finite ones`; `ui/src/util/panelWidth.test.ts` — `falls back safely when storage access is denied` | Malformed data uses 288 pixels, an excessive finite value clamps to 640 pixels, and denied storage access neither throws nor prevents a safe default. |
| components | Resize the History commit list | covered | `ui/src/components/GitFileHistory.test.tsx` — `Resize the History commit list: resizes by pointer and keyboard within both bounds` | Pointer movement updates the desktop width variable live but persists only on completion; both 224/640-pixel bounds, keyboard adjustment, Home reset, ARIA value, and the flexible diff column are asserted. |
| components | Restore independent panel widths | covered | `ui/src/components/GitFileHistory.test.tsx` — `Restore independent panel widths: restores History without changing the Files preference`; `ui/src/components/Sidebar.test.tsx` — `Restore the preferred width: restores a completed resize after remounting` | History restores its own saved width after remount, changing it leaves the Files key untouched, and Files independently restores its preference. |
| components | Preserve the stacked History layout | covered | `ui/src/components/GitFileHistory.test.tsx` — `Preserve the stacked History layout: keeps full-width responsive sizing and hides the desktop separator` | The commit list retains full-width narrow-layout sizing, applies the custom width only at the medium breakpoint, and hides the vertical separator until that breakpoint. |

## Applicable existing scenarios

| Capability | Scenario | Status | Test file and test name | Contract asserted |
|---|---|---|---|---|
| components | SelectWorkspaceFile | covered | `ui/src/components/Sidebar.test.tsx` — `passes a file selection straight through`; `ui/src/components/FileTree.test.tsx` — `reports the full path of the chosen file` | The resized sidebar still renders the tree and forwards the complete selected path through the existing callback boundary. |
| components | RequestFileCreation | covered | `ui/src/components/FileTree.test.tsx` — `reports the joined path for a file` | The tree nested inside the resized sidebar continues to emit file-creation requests through its callback without performing filesystem work. |
| components | InspectFileHistory | covered | `ui/src/components/GitFileHistory.test.tsx` — `compares any two revisions when the roles are named`; `shows what a commit did to the file in one click` | Adding the split handle does not change revision selection: explicit pairs and a commit-to-parent comparison still emit the expected revisions for the diff. |
