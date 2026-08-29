## MODIFIED Requirements

### Requirement: ConfigureTheMountedWidget

- **Implementation**: `mount::embed/src/mount.tsx`

> `MountOptions`, `MountHandle` and `Theme` are type declarations. The link
> index covers behaviour, not types, so they cannot be anchored; `mount` is the
> exported function that implements this requirement.

The system SHALL accept mount options and apply the following defaults: the
backend origin defaults to the host page's own origin; the initial theme falls
back to the server's `branding.defaultTheme`, then to `"system"`; and a supplied
auth token SHALL be used directly, so a host that already authenticates its user
never sees a token screen.

The host MAY name the workspace the widget binds to. When it does, the widget
binds to that workspace; when it does not, the widget binds to the server's
default workspace.

The mounted widget SHALL expose workspace controls according to the server's
configured embed policy. In `settings` mode it SHALL remain bound to one project
and SHALL expose sandbox-root selection only through Settings. In `root` mode it
SHALL additionally show a compact root selector at the left of the header;
choosing a readable directory SHALL persistently replace the current sandbox
root, preserve the sandbox's other permissions and locks, and rebuild the current
workspace without opening another one. In `projects` mode it SHALL expose the
existing project open, switch, and close controls. An active server workspace
lock SHALL suppress project controls regardless of the embed policy.

#### Scenario: HostSuppliesItsOwnToken
- **GIVEN** a server configured with `server.token` and a host that passes it
- **WHEN** the widget mounts
- **THEN** the session authenticates with that token
- **AND** no token prompt is shown

#### Scenario: NoBackendOriginGiven
- **GIVEN** mount options without a `serverUrl`
- **WHEN** the widget mounts
- **THEN** it targets the host page's own origin

#### Scenario: HostNamesTheWorkspace
- **GIVEN** a server with several projects open and mount options naming one of them
- **WHEN** the widget mounts
- **THEN** it is bound to that workspace

#### Scenario: NoWorkspaceNamed
- **GIVEN** mount options naming no workspace
- **WHEN** the widget mounts
- **THEN** it is bound to the server's default workspace

#### Scenario: SettingsModeKeepsProjectControlsHidden
- **GIVEN** a mounted widget configured with `embed.workspaceControls` set to `settings`
- **WHEN** the user looks for a project opener or selector
- **THEN** none is offered
- **AND** an unlocked configured sandbox root remains editable through Settings

#### Scenario: RootModeReplacesTheSingleSandboxRoot
- **GIVEN** a mounted widget configured with `embed.workspaceControls` set to `root` and an editable sandbox
- **WHEN** the user chooses a readable server directory compatible with the sandbox's preserved writable root
- **THEN** that directory becomes the persisted sandbox root
- **AND** the sandbox's write, bash, writable-root, and lock settings are preserved
- **AND** the current workspace is rebuilt without adding another open project

#### Scenario: RootReplacementMustPreserveAValidSandbox
- **GIVEN** a mounted widget in `root` mode whose writable root would fall outside a chosen replacement root
- **WHEN** the user chooses that replacement root
- **THEN** the change is refused with an explanation
- **AND** the current sandbox root and workspace remain unchanged

#### Scenario: LockedRootCannotBeReplaced
- **GIVEN** a mounted widget in `root` mode whose sandbox root is locked
- **WHEN** the root control is presented
- **THEN** it identifies the current root as locked and does not permit choosing a replacement

#### Scenario: ProjectsModeOffersProjectControls
- **GIVEN** a mounted widget configured with `embed.workspaceControls` set to `projects`
- **WHEN** the server is not workspace-locked
- **THEN** the widget offers the existing project open, switch, and close controls

#### Scenario: WorkspaceLockOverridesProjectsMode
- **GIVEN** a mounted widget configured with `embed.workspaceControls` set to `projects`
- **WHEN** the server is workspace-locked
- **THEN** no project open, switch, or close control is offered
