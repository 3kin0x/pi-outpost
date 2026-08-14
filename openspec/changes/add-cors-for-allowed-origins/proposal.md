## Why

The server never emits a CORS header. `server.allowedOrigins` gates the WebSocket
handshake and the `Host` check, and nothing else — so a widget mounted on a host
page fetches `GET /branding`, the server answers 200, and the browser discards the
response before the widget sees it.

The widget survives this: `useAgent` swallows the failure and the branding arrives
moments later on the WebSocket's `hello`. What is lost is the reason the route
exists. The server starts its HTTP listener *before* the agent runtime precisely so
branding does not wait behind a setup that "can take a few seconds", because that
wait was showing up as a flash of default branding on every page load. Cross-origin,
that flash is back — and only for embedded hosts, which is the one deployment nobody
sees while developing.

The inconsistency is the sharper half. `allowedOrigins` already grants those origins
the WebSocket, which drives an agent that can read the workspace and — depending on
configuration — write files and run bash. Granting that while refusing to answer a
request for the window title is not a security posture; it is an oversight that
reads like one.

Found by the browser smoke test added in #59, which records it as an expected
failure pointing here.

## What Changes

- Requests carrying an `Origin` the server already accepts SHALL receive the CORS
  response headers that let the browser hand the response to the page.
- This applies to **every HTTP route** the server exposes, on the same terms as the
  WebSocket: the origin is echoed back only when `originAllowed` accepts it — the
  same predicate, so there is one answer to "is this origin allowed" and not two.
- Preflight (`OPTIONS`) SHALL be answered for those origins, because the widget
  sends `Authorization: Bearer` when the server is token-protected, and that header
  makes the request preflighted.
- The origin SHALL be echoed exactly and never `*`, and responses SHALL carry
  `Vary: Origin` so a shared cache cannot serve one origin's response to another.
- Authentication is unchanged. CORS decides whether a browser may *read* a
  response; it grants nothing on its own. Every route keeps the token check and the
  path confinement it has today.

Not a breaking change: an origin that was refused before is still refused, and a
same-origin deployment sees no difference.

## Capabilities

### New Capabilities

None — this is about how existing routes answer.

### Modified Capabilities

- `api`: the HTTP routes gain a defined cross-origin behaviour, and a preflight
  response. Today the requirements describe status codes and bodies as though every
  caller were same-origin.
- `embed`: a widget mounted against a `serverUrl` other than the host page's own
  origin can read what it is allowed to read — currently only the WebSocket
  survives that distance, which the spec does not say anywhere.

## Impact

- `server/src/index.ts` — the route handlers and `originAllowed`.
- `server/test/` — a suite for the header behaviour; the existing origin tests
  cover the WebSocket only.
- `e2e/embed.spec.ts` — the `test.fail()` marker comes off, and the test becomes a
  regression guard.
- No configuration change: `server.allowedOrigins` keeps its meaning and gains
  reach. A deployment that lists an origin today gets the fix by upgrading.
- No new dependency: `@fastify/cors` would do this, but the decision is a handful
  of headers on a predicate the server already computes, and the project is
  deployed air-gapped.
