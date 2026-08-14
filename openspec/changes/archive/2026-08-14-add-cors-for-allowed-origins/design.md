## Context

The server computes `originAllowed(origin)` today and uses it in exactly one place:
the WebSocket upgrade. Every HTTP route answers without consulting it and without
emitting a header, which is why a cross-origin `GET /branding` returns 200 to a
response the browser then throws away.

Two constraints shape everything below. The deployment is air-gapped, so no new
dependency. And `allowedOrigins` is already a statement of trust strong enough to
hand an origin the WebSocket — which drives an agent that reads the workspace and,
depending on configuration, writes files and runs bash. Anything decided here is
strictly smaller than what that origin already has.

## Goals / Non-Goals

**Goals**

- A browser on an allowed origin can read what the server already decided to send.
- One predicate for "is this origin allowed", shared with the WebSocket.
- No change to authentication, confinement, or any status code.

**Non-Goals**

- Not a general CORS configuration surface. No new config key, no per-route policy,
  no method or header allowlists to tune. The list of origins is the whole policy.
- Not cookie-based credentials. The token travels in a header or a query string;
  `Access-Control-Allow-Credentials` is not part of this and turning it on later
  would be a separate decision with its own reasoning.

## Decisions

### D1 — One predicate, reused

CORS decisions call `originAllowed`, the function the WebSocket upgrade already
calls. Not a copy, not a parallel list.

Two predicates would drift, and the drift would be silent in the direction that
matters: a route that accepts an origin the WebSocket refuses looks like it works
until someone audits it. Sharing the function also means the local-development
origins keep working without being restated.

### D2 — Echo the origin, never `*`

The response names the requesting origin exactly. `*` is not shorthand for "the
configured list" — it is a claim about every origin that exists, including those
the configuration deliberately omits. It is also incompatible with sending
credentials, which forecloses a decision this change should leave open.

Consequence: responses depend on the request's `Origin`, so they carry
`Vary: Origin`. Without it a shared cache can serve the response it stored for one
origin to a page on another, which turns a correct policy into an incorrect one at
the cache layer.

### D3 — Cover every route, uniformly

Every HTTP route answers on the same terms, rather than an allowlist of routes
judged safe.

The alternative — `/branding` and `/health` only — is smaller but arbitrary. It
would leave a widget unable to display an image the agent just referenced, and the
line between "safe to read cross-origin" and "not" would have to be re-litigated
every time a route is added. Uniformity means the rule is stated once and holds.

What makes this defensible is that CORS grants no authority: `/files/raw` still
demands its token, still confines its path, still refuses on `Host`. An origin that
can already open the WebSocket can already ask the agent to read a file and send
back its contents. Refusing the same origin a direct read was never protecting
anything.

### D4 — Answer preflight, and answer it as a question

`OPTIONS` from an allowed origin is answered with the methods and headers the routes
use, including `Authorization`.

It has to be: a token-protected deployment sends `Authorization: Bearer`, which is
not a CORS-safelisted header, so the browser preflights every such request. Handling
the actual request while ignoring the preflight would fix the unauthenticated case
and leave the authenticated one broken — the deployments that took the most care.

A preflight is answered *as a preflight*: no token required, no route body executed,
no state touched. Requiring a token would be a category error, since the browser
sends the preflight without one by design. What it discloses is whether an origin is
configured — which that origin can already learn by opening a WebSocket.

### D5 — Silence for an origin that is not allowed

An unknown origin gets no CORS header, and the response is otherwise exactly what
it is today: served or refused on its own merits.

Refusing with a distinct status instead would tell any page which origins a server
is configured for, and it would do it without needing to be allowed at all. Absence
of the header already achieves the protection — the browser will not deliver the
body — so adding a status change buys nothing and discloses something.

## Risks / Trade-offs

**A configuration mistake now reaches further.** Before this change, listing a
careless origin in `allowedOrigins` handed it the WebSocket. Now it also hands it
HTTP reads. In practice the second is dominated by the first — an agent session can
read anything `/files/raw` can — but the blast radius of a typo is worth stating
plainly rather than discovering later.

**Preflight is easy to get subtly right and functionally wrong.** A preflight that
allows the wrong header, or caches its answer too long, fails in a way that looks
like a network problem. The tests need to drive a real browser for at least one
authenticated case; a `curl` with the right headers proves the server's half only,
and it is the browser's half that has been broken all along.

**"Every route" includes routes not yet written.** Uniformity is the point, but a
future route that returns something genuinely origin-sensitive would inherit this
without anyone deciding. Cross-origin exposure belongs on the checklist for adding a
route, which is a documentation cost this change takes on.

## Migration Plan

None required. An origin refused before is refused now; a same-origin deployment
sees no difference; no configuration key changes meaning. Deployments that already
list an origin get the fix by upgrading.

## Open Questions

- Should `Access-Control-Max-Age` be set, and to what? A long cache spares the
  round-trip; a short one makes a configuration change take effect promptly. Left to
  implementation, defaulting to short — this is a localhost-latency round trip in the
  common case.
