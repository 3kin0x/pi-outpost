## ADDED Requirements

### Requirement: FileTreeReflectsDiskChanges

The frontend SHALL keep the file tree in agreement with the workspace without requiring the user
to act. On being told that a directory changed, it SHALL re-list that directory if the tree is
holding it, and SHALL ignore the notification otherwise — a directory nobody expanded has nothing
to refresh.

When the file open in the viewer lives in a directory that changed, the frontend SHALL re-read it,
so a preview never keeps showing bytes that are no longer on disk. An edit in progress SHALL NOT
be discarded by this: unsaved work belongs to the user, and the existing save-time conflict check
is where that collision is resolved.

Git status SHALL be refreshed on the same signal, so badges do not outlive the state they describe.

#### Scenario: HeldDirectoryIsRelisted
- **GIVEN** the tree is showing a directory's contents
- **WHEN** the frontend is told that directory changed
- **THEN** it requests that directory's listing again

#### Scenario: UnheldDirectoryIsIgnored
- **GIVEN** a directory the tree has never expanded
- **WHEN** the frontend is told that directory changed
- **THEN** no listing is requested for it

#### Scenario: OpenPreviewFollowsItsDirectory
- **GIVEN** a file displayed in the viewer, not being edited
- **WHEN** the frontend is told that the file's directory changed
- **THEN** the file is read again so the viewer shows what is on disk

#### Scenario: EditInProgressSurvives
- **GIVEN** a file open in edit mode with unsaved changes
- **WHEN** the frontend is told that the file's directory changed
- **THEN** the unsaved buffer is left alone

### Requirement: ManualTreeRefresh

The frontend SHALL offer a control that re-lists every directory the tree is currently holding,
in one action. It SHALL be offered whether or not the server is watching the filesystem, because
a watcher that reports nothing — a filesystem that emits no events, a spent watch budget — is
indistinguishable from a workspace that did not change.

#### Scenario: RefreshRelistsEveryHeldDirectory
- **GIVEN** the tree is holding several directories' contents
- **WHEN** the user activates the refresh control
- **THEN** each of those directories is listed again

#### Scenario: RefreshIsAlwaysAvailable
- **GIVEN** any file tree
- **THEN** the refresh control is present, independently of whether directory watching is on
