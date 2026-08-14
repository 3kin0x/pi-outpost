## ADDED Requirements

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
