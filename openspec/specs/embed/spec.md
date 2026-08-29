# Embed Specification

> Authored from openlore `prepare_spec_generation` evidence on 2026-08-11
> Anchors verified against the analysis graph; no overlap with existing specs

## Purpose

The embedding contract: how a host application mounts pi-outpost into one of its
own elements, isolated from the host page's CSS in both directions, and how it
controls the widget afterwards. This is the only surface a consumer of the
published package touches.

## Requirements

> `embed/src/mount.tsx`

### Requirement: MountIntoAHostElement

- **Implementation**: `mount::embed/src/mount.tsx`

The system SHALL mount the application into a caller-supplied container element
inside a **Shadow DOM**, so isolation holds in both directions: the widget's CSS
reset never reaches the host page, and the host page's styles never bleed into the
widget. It SHALL return a handle for controlling the mounted instance.

#### Scenario: HostPageWithItsOwnStyles
- **GIVEN** a host page with global CSS
- **WHEN** the widget is mounted into a container
- **THEN** the widget renders with its own styles
- **AND** neither side's rules affect the other

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

#### Scenario: WidgetOffersNoSwitching
- **GIVEN** a mounted widget on a server with several projects open and no `embed.workspaceControls` configured
- **WHEN** the user looks for a project selector
- **THEN** none is offered

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

### Requirement: ControlAndUnmountTheWidget

- **Implementation**: `mount::embed/src/mount.tsx`

> `MountOptions`, `MountHandle` and `Theme` are type declarations. The link
> index covers behaviour, not types, so they cannot be anchored; `mount` is the
> exported function that implements this requirement.

The returned handle SHALL expose `unmount()` and `setTheme()`. Unmounting SHALL
tear down the React tree and leave the caller's container **in the DOM**, with an
empty shadow root — the host owns that element and the widget must not remove it.
`setTheme()` SHALL let the host drive the theme, which is the case when it
disables the widget's own toggle.

#### Scenario: HostRemovesTheWidget
- **GIVEN** a mounted widget
- **WHEN** `unmount()` is called
- **THEN** the React tree is torn down
- **AND** the host's container element remains in the DOM

#### Scenario: HostDrivesTheTheme
- **GIVEN** a host application that manages light/dark itself
- **WHEN** it calls `setTheme("dark")`
- **THEN** the widget applies the dark theme to its own root

### Requirement: PublishAStandaloneTypeSurface

- **Implementation**: `mount::embed/src/mount.tsx`

> `MountOptions`, `MountHandle` and `Theme` are type declarations. The link
> index covers behaviour, not types, so they cannot be anchored; `mount` is the
> exported function that implements this requirement.

The published type surface SHALL NOT import from the repository's private shared
package: a shipped `mount.d.ts` referencing it would resolve to nothing in a
consumer's project. The theme union SHALL therefore be spelled out here, and kept
in step with the shared definition by assignment.

#### Scenario: ConsumerCompilesAgainstThePackage
- **GIVEN** a consumer project with only the published package installed
- **WHEN** it type-checks against `mount.d.ts`
- **THEN** every referenced type resolves without the private package

### Requirement: ReachTheBackendFromAnotherOrigin

A widget mounted with a `serverUrl` other than the host page's own origin SHALL
reach everything it is entitled to reach, not only the WebSocket.

This is the ordinary case rather than the exotic one: a host application is served
from its own domain and points the widget at a backend elsewhere, which is what the
`serverUrl` option exists for. The server the widget is pointed at must already name
the host's origin in `server.allowedOrigins`, or nothing connects at all.

In particular, the branding request SHALL succeed from that distance. Branding
reaches the client twice — once over HTTP, before the agent runtime has finished
starting, and again in the WebSocket's opening message. The HTTP request is the one
that arrives first, and it exists to close a window of seconds during which the
interface would otherwise show defaults it is about to replace. A widget that gets
branding only from the WebSocket is not merely slower to style itself; it visibly
restyles in front of the user.

#### Scenario: BrandingArrivesBeforeTheSession
- **GIVEN** a widget mounted with a `serverUrl` on a different origin, listed in that server's allowed origins
- **WHEN** it mounts
- **THEN** it renders the server's branding without first showing the defaults

#### Scenario: NoConsoleErrorFromMounting
- **GIVEN** a widget mounted against an allowed cross-origin backend
- **WHEN** it mounts
- **THEN** no request it makes is refused by the browser

## Technical Notes

- **Isolation mechanism**: Shadow DOM, chosen over an iframe so the widget shares
  the host's page context while keeping styles separate.
- **Related**: the theme applied here targets the widget's own root element rather
  than the document root — see the Theme specification.
