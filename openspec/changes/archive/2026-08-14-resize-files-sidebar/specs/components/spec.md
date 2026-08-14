## ADDED Requirements

### Requirement: Resizable Files Sidebar

When the Files sidebar is open, the component layer SHALL expose a focusable vertical resize handle on its right boundary. Pointer movement and keyboard commands on that handle SHALL change the sidebar width within a 224-pixel minimum and a 640-pixel maximum. The default width SHALL remain 288 pixels.

The component layer SHALL persist a valid user-selected width in local browser storage and restore it after the sidebar or application is reopened. Missing, malformed, or out-of-range stored values MUST be ignored or clamped without preventing the sidebar from rendering.

#### Scenario: Resize with pointer input
- **GIVEN** the Files sidebar is open at its current width
- **WHEN** the user drags its resize handle horizontally
- **THEN** the sidebar follows the horizontal pointer position and the main content uses the remaining width

#### Scenario: Enforce resizing bounds
- **GIVEN** the Files sidebar resize handle is active
- **WHEN** the user attempts to resize below 224 pixels or above 640 pixels
- **THEN** the displayed width is clamped to the applicable boundary

#### Scenario: Resize with the keyboard
- **GIVEN** the Files sidebar resize handle has keyboard focus
- **WHEN** the user presses Left Arrow or Right Arrow
- **THEN** the sidebar width decreases or increases by a consistent step within the same bounds

#### Scenario: Restore the preferred width
- **GIVEN** the user previously completed a resize to a valid width
- **WHEN** the Files sidebar or application is reopened
- **THEN** the sidebar restores that width instead of the default

#### Scenario: Recover from an invalid stored preference
- **GIVEN** the stored sidebar-width preference is missing, malformed, or outside the supported bounds
- **WHEN** the Files sidebar opens
- **THEN** the sidebar renders at the default width or the nearest supported boundary without an application error

### Requirement: Resizable File History Split

When file History presents its commit list and diff side by side, the component layer SHALL expose a focusable vertical resize handle between them. Pointer and keyboard resizing SHALL change the commit-list width within the same 224-pixel minimum and 640-pixel maximum, with 416 pixels as its default.

The History width SHALL use a local browser-storage preference distinct from the Files sidebar preference. When the History layout stacks the commit list above the diff, the component layer MUST preserve the stacked layout and MUST NOT expose an inapplicable vertical resize handle.

#### Scenario: Resize the History commit list
- **GIVEN** file History displays the commit list beside the diff
- **WHEN** the user drags the separator horizontally or resizes it with Left Arrow or Right Arrow
- **THEN** the commit-list width changes within 224–640 pixels and the diff uses the remaining width

#### Scenario: Restore independent panel widths
- **GIVEN** the user saved different valid widths for Files and the History commit list
- **WHEN** either surface is reopened
- **THEN** each surface restores its own width without changing the other preference

#### Scenario: Preserve the stacked History layout
- **GIVEN** file History displays the commit list above the diff in a narrow layout
- **WHEN** the History surface renders
- **THEN** the commit list retains its responsive stacked sizing and no vertical resize handle is available
