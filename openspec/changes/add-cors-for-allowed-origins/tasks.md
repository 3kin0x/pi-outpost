## 1. The headers

- [ ] 1.1 A helper in `server/src/index.ts` that, given a request and a reply, applies the CORS headers when `originAllowed` accepts the request's `Origin` and does nothing otherwise (design D1, D5). One function, so no route can be half-covered.
- [ ] 1.2 Apply it to every HTTP route uniformly — a hook rather than a call in each handler (design D3). A per-handler call is a list that a future route joins by being remembered.
- [ ] 1.3 Echo the exact origin and set `Vary: Origin`; never `*` (design D2). The `Vary` header is the half that is easy to omit and only fails behind a cache.

## 2. Preflight

- [ ] 2.1 Answer `OPTIONS` for an allowed origin with the methods the routes use and the request headers the client sends — `Authorization` above all (design D4).
- [ ] 2.2 A preflight requires no token and executes no route body (design D4). Assert this, rather than assuming the framework's routing gives it for free.
- [ ] 2.3 Decide `Access-Control-Max-Age` (design, Open Questions). Short by default; state the number and why in a comment rather than leaving it to the framework.

## 3. Tests

- [ ] 3.1 `server/test/`: an allowed origin gets the header and `Vary`; an unknown origin gets neither and the response is otherwise unchanged; the header is never `*`.
- [ ] 3.2 Every route is covered — assert over the route list rather than a handful of examples, so a route added later fails the test instead of quietly opting out.
- [ ] 3.3 A local development origin still passes with an empty `allowedOrigins`, which is the configuration every contributor runs.
- [ ] 3.4 Preflight: allowed origin with `Authorization` is answered; a preflight carries no body and needs no token; an unknown origin's preflight gets no headers.
- [ ] 3.5 Authentication is untouched: a token-protected route still answers 401 to a cross-origin request with no token, *with* the CORS headers present — the browser must be able to read the 401, or the client cannot tell "refused" from "unreachable".

## 4. The browser half

- [ ] 4.1 Remove the `test.fail()` marker in `e2e/embed.spec.ts` — the test becomes a regression guard rather than a record of a known gap. Its long comment explaining the gap goes with it; leave a short one naming this change.
- [ ] 4.2 Extend the smoke test to a token-protected server, so the preflight path is exercised by a real browser (design, Risks). A `curl` proves the server's half; only a browser proves the browser's.
- [ ] 4.3 Assert the widget shows the server's branding rather than the defaults — the outcome this change exists for, not just the header that enables it.

## 5. Documentation

- [ ] 5.1 `embed/README.md`: state that the backend must list the host page's origin in `server.allowedOrigins`, and that this is now sufficient for a cross-origin mount rather than sufficient only for the WebSocket.
- [ ] 5.2 Note next to the route definitions that a new route inherits cross-origin exposure (design, Risks) — the cost uniformity takes on.

## 6. Verification

- [ ] 6.1 Full server suite and coverage gate (lines 92 / branches 86 / functions 90).
- [ ] 6.2 `npm run test:e2e` green, including the un-failed embed test.
- [ ] 6.3 `openspec validate add-cors-for-allowed-origins --strict`.
- [ ] 6.4 Manually verify with a token-protected server and a host page on another origin: branding correct on first paint, no console error, and a workspace image displayed in a message.
