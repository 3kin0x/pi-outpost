## Why

pi-outpost's web interface is a long-lived working surface — an agent session, a file tree, a conversation the user returns to — and it can only be reached as a browser tab among other tabs. It has no web app manifest at all, so no browser offers to install it, and it cannot be opened in its own window from the taskbar or dock.

## What Changes

- Serve a web app manifest from the standalone interface, so Microsoft Edge (and any Chromium browser) offers to install pi-outpost as an app and runs it in its own window.
- Add the icon sizes an installed app needs, including a maskable icon, alongside the existing favicon.
- Declare the app's identity for the installed window: name, short name, `start_url`, `display: standalone`, background and theme colours.
- **No service worker.** Edge does not require one to install, and Chrome dropped the requirement for installation from the menu. The interface is useless without its WebSocket, so caching the shell would buy a slightly nicer disconnected screen while risking a stale build being served after an update.
- The manifest belongs to the standalone interface only. A mounted widget lives inside a host page whose identity, manifest and installability are the host's, and the widget must not claim any of them.
- The manifest and its icons must reach the browser from every way the interface is served: `fastifyStatic` from `web/dist` in development and npm installs, and the inlined bundle inside the standalone executable.

## Capabilities

### New Capabilities

- `web-app-installation`: what the standalone interface declares about itself so a browser can install it, what an installed window shows, and what installation deliberately does not change.

### Modified Capabilities

None. The embed contract already says a mounted widget makes no claim on the host page; installation adds no requirement there, and the standalone serving behaviour in `api` is unchanged — the manifest and icons are ordinary static assets on the existing route.

## Impact

- `web/index.html` — the manifest link and a theme colour.
- `web/public/` — the manifest file and the PNG icons an installed app needs.
- `cli/scripts/embed-web.mjs` — its MIME table decides the content type of every inlined asset; a manifest served as `application/octet-stream` is ignored by the browser.
- Scope boundary confirmed with the requester: installation happens from `http://127.0.0.1:PORT`, which browsers treat as a secure context. A deployment reached over a plain-HTTP LAN address is not a secure context and is out of scope; TLS for such a deployment is a separate concern with a separate change.
- Deployment branding (`branding.title`) is not carried into the manifest — see `design.md` for why the token-gated branding endpoint cannot serve it.
