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
default workspace. The widget SHALL offer no project switching in either case —
which project an embedded widget shows is the host's decision, not its user's.

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
- **GIVEN** a mounted widget on a server with several projects open
- **WHEN** the user looks for a project selector
- **THEN** none is offered
