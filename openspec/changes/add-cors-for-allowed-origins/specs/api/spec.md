## ADDED Requirements

### Requirement: CrossOriginResponses

The server SHALL answer a request carrying an `Origin` header it accepts with the
response headers a browser requires before handing that response to the page. This
applies to every HTTP route the server exposes; the existing status codes, bodies,
size limits, confinement and token checks are unchanged.

An origin is accepted here on exactly the terms the WebSocket upgrade already uses:
local development origins, plus the exact origins listed in
`server.allowedOrigins`. There SHALL be one predicate answering "is this origin
allowed", not two — a route that answered differently from the WebSocket would be a
difference nobody could explain and everybody would eventually rely on.

The allowed origin SHALL be echoed back exactly as sent. The server SHALL NOT
answer with `*`: a wildcard would extend to origins the configuration never named,
and it is not a shorthand for the list — it is a different, larger claim.

Responses that vary by origin SHALL say so (`Vary: Origin`), including requests
that omit `Origin` and responses to refused origins, so a shared cache cannot
serve one origin's response to another.

A request whose `Origin` is not accepted SHALL receive no CORS headers. The
response itself is unchanged — the request is still served or still refused on its
own merits — because withholding the header already stops the browser from
delivering it, and changing the status as well would leak whether an origin is
configured.

Cross-origin permission grants no authority. A route that requires a token still
requires it, a confined path is still confined, and a refused request is still
refused. What changes is only whether the browser lets the page read a response the
server had already decided to send.

#### Scenario: AllowedOriginReadsTheResponse
- **GIVEN** a server whose `server.allowedOrigins` names `https://app.example.com`
- **WHEN** it receives `GET /branding` with that `Origin`
- **THEN** the response carries that exact origin in its CORS headers
- **AND** it carries `Vary: Origin`

#### Scenario: EveryRouteAnswersTheSameWay
- **GIVEN** an accepted origin
- **WHEN** it requests any HTTP route the server exposes
- **THEN** each response carries the CORS headers, on the same terms

#### Scenario: UnknownOriginGetsNoHeader
- **GIVEN** a server whose allowlist does not name `https://evil.example`
- **WHEN** it receives a request with that `Origin`
- **THEN** the response carries no CORS headers, and the browser withholds it from the page

#### Scenario: NeverAWildcard
- **WHEN** any request is answered with CORS headers
- **THEN** the allowed origin is a single exact origin and never `*`

#### Scenario: LocalDevelopmentStillWorks
- **GIVEN** a server with an empty `server.allowedOrigins`
- **WHEN** a page served from a localhost dev server requests a route
- **THEN** the response carries the CORS headers, as the WebSocket already accepts that origin

### Requirement: PreflightRequests

The server SHALL answer a CORS preflight (`OPTIONS`) from an accepted origin with
the methods and request headers its routes actually use, so the browser proceeds to
the real request.

When the allowed headers are derived from `Access-Control-Request-Headers`, the
response SHALL vary on that request header so a shared cache cannot reuse an
incompatible preflight answer.

Preflight is not optional for this client: when `server.token` is set the widget
sends `Authorization: Bearer …`, and that header alone makes the browser preflight
the request. Answering the actual request correctly while leaving the preflight
unanswered would fail exactly the deployments that authenticate.

A preflight SHALL NOT be treated as the request it describes: it SHALL NOT require
a token, and it SHALL NOT read a file, start a session, or change any state. It is
a question about permission, and answering it discloses only what the configuration
already states.

#### Scenario: PreflightForAnAuthenticatedRequest
- **GIVEN** a token-protected server and an accepted origin
- **WHEN** it receives `OPTIONS` for a route, asking to send `Authorization`
- **THEN** the response allows that header, and the browser sends the real request

#### Scenario: PreflightCarriesNoContent
- **WHEN** a preflight is answered
- **THEN** the response has no body and no route was executed

#### Scenario: PreflightFromAnUnknownOrigin
- **GIVEN** an origin the server does not accept
- **WHEN** it sends a preflight
- **THEN** the response carries no CORS headers, and the browser abandons the request
