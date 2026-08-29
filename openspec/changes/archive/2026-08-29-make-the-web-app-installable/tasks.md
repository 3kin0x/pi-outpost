## 1. Icons

- [x] 1.1 Generate the raster app icons from the existing artwork and commit them under `web/public/`, including one whose subject sits inside the maskable safe zone; verify each declared size exists at the declared path and opens as a valid image.
- [x] 1.2 Check the maskable icon against a circular and a squircle crop and confirm nothing meaningful is cut; record what was checked, since a manifest cannot assert this and a review reading JSON cannot see it.

## 2. The manifest

- [x] 2.1 Add the web app manifest under `web/public/` with name, short name, `start_url`, `display: standalone`, background and theme colours, and the icons from task 1; verify a build places it in `web/dist` at the path the page links.
- [x] 2.2 Link the manifest from `web/index.html` and set the matching theme colour; verify the served page carries both.
- [x] 2.3 Add the manifest's extension to the content-type table in `cli/scripts/embed-web.mjs`; verify a test asserts the inlined asset's content type against that table rather than against a list maintained only by the test, so a manifest that stops being recognised fails here.

## 3. Serving it every way the interface is served

- [x] 3.1 Verify over a running server, from a built `web/dist`, that the manifest and every icon it names are served with the right content type and a success status — driven against the real routes, not a stub of them.
- [x] 3.2 Verify the same against the inlined bundle path — the one where a missing extension makes the manifest arrive as an opaque stream and installability disappears with no error anywhere.

## 4. Installing it, in a real browser

- [x] 4.1 Load the standalone interface from `http://127.0.0.1:PORT` in Edge, confirm it offers to install, install it, and confirm the app opens in its own window carrying the declared name and icon. Confirmed by the requester: Edge offered the install, the app opens in its own window with the declared name and icon.
- [x] 4.2 In the installed window, drive the interface itself — a session, the file tree, a conversation — and confirm it behaves as the browser tab does and connects to the same server with the same sessions. Confirmed by the requester.
- [x] 4.3 Stop the server, open the installed app, and confirm it reports that it cannot reach the server rather than presenting a conversation or file tree from the previous run. Confirmed by the requester: the installed app shows "connexion perdue" and no conversation.
- [x] 4.4 Rebuild the interface with a visible change, reopen the installed app, and confirm it loads the new build — the stale-shell failure this change avoids by shipping no service worker. Confirmed by the requester: a temporary banner, shipped in a newly-hashed bundle, appeared after a rebuild. The first attempt showed nothing for an unrelated reason — a `build:sea` run had refilled `server/src/embedded-web.ts`, and the server prefers that inlined bundle over `web/dist`, so it was serving a frozen snapshot. Reset with `scripts/ensure-embedded-web.mjs --reset`.
- [x] 4.5 Confirm no service worker is registered by the interface: check the browser's registrations after using the installed app, so a later dependency that quietly registers one is caught here.

## 5. The widget claims nothing

- [x] 5.1 Verify in the running embed bench that mounting the widget into the host page adds no manifest link and changes neither the host page's title, icon, theme colour, nor its own installability.

## 6. Scenario coverage and validation

- [x] 6.1 Enumerate every `#### Scenario:` in the delta spec and write the scenario-to-test matrix with assertion-level evidence, naming for each row what would fail if the behaviour broke; leave no scenario partial or uncovered — `scenario-coverage.md`, 9/9 covered, 0 partial, 0 uncovered
- [x] 6.2 Run the focused server and web tests, then the relevant full suites, the Playwright suite, and `openspec validate make-the-web-app-installable --strict` — typecheck passed; lint passed; server 1,573 passed with nothing skipped; UI 1,340 passed; Playwright 45/45 passed; strict validation passed. Recorded in `scenario-coverage.md`
