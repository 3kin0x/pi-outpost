Every `#### Scenario:` in this change's delta spec, and what proves it.
Built for task 6.1. Read the assertions, not the names: a scenario counts as
**covered** only when the check would fail if the behaviour broke at the boundary
the scenario describes.

Files referenced:

- `server/test/webAppManifest.test.mjs` (`srv`) — a real server, the real static
  route, driven off the built manifest rather than a list kept in the test
- `server/test/embeddedWebAssets.test.mjs` (`inl`) — what the executable's
  inlined bundle says each asset is, asserted against the generator's own table
- `server/test/webAssetCache.test.ts` (`cache`) — what a browser is told it may
  keep across an update
- `e2e/embed.spec.ts` (`e2e`) — the widget inside a host page
- **browser** — driven by hand in a real browser against a running server
- **requester** — observed by the requester in Edge, with the app installed

## web-app-installation (9 scenarios, 10 rows — the two host-page scenarios are proved by different host pages)

| Scenario | Status | Evidence |
| --- | --- | --- |
| TheBrowserIsOfferedTheApp | covered | srv "the page links a manifest, and the manifest is served as one" asserts the `rel="manifest"` link in the served HTML and then fetches it, requiring `display: standalone`, `start_url` and a name; browser check on a running server confirmed the manifest parses and `isSecureContext` is true; requester confirmed Edge offered the install |
| TheManifestCarriesItsOwnContentType | covered | srv requires the content type to match `manifest+json` or `application/json` and inl "a web app manifest is inlined as a manifest, not as an opaque stream" pins the executable's answer to `application/manifest+json` and explicitly not to `application/octet-stream` |
| InstallableFromTheStandaloneExecutable | covered | inl asserts every extension the generator knows survives into the bundle, driven off the exported table so an entry deleted there fails here; verified end to end against a real rebuilt bundle serving from memory — `/manifest.webmanifest` returned `200 application/manifest+json` and all three icons were served, with no `web/` directory beside it |
| IconsCoverAnInstalledApp | covered | srv "the icon set covers what an installed app is presented at" requires 192, 512 and at least one `purpose` containing `maskable`; the maskable artwork was checked against a circular crop, a squircle crop and the 80% safe-zone circle, and nothing is cut |
| TheInstalledWindowIsTheInterface | covered | requester: installed from Edge, the app opens in its own window with the declared name and icon, and the interface behaves as the tab did against the same server |
| InstallationChangesNoBehaviour | covered | requester, same session — the installed window drives the same interface. No code path branches on being installed: there is nothing that reads `display-mode`, so there is no behaviour for installation to change |
| NoStaleBuildAfterAnUpdate | covered | requester: a temporary banner, shipped in a newly-hashed bundle, appeared after a rebuild — which required `index.html` itself to be re-fetched, since that is where the hashed name is written. cache pins the rule the executable now states: `no-cache` for the page, the manifest and the icons, `immutable` only for `/assets/` names that change with their content |
| NoServerNoSession | covered | requester: with the server stopped, the installed app shows "connexion perdue" and no conversation |
| TheWidgetAddsNoManifest | covered | e2e "the widget makes no installability claim on the host page": after the widget has mounted and connected, the host document has no manifest link, no theme-color meta, no icon link, an unchanged title, and the widget's own shadow root links no manifest either |
| TheHostPageIsUnchanged | covered | e2e "a host that already owns install metadata keeps exactly what it declared" mounts into a host that declares its own manifest, theme colour, icon and title, and requires each to come back byte-identical — a host with no metadata cannot show a widget that *replaces* what it found |

## Result

All **9 scenarios are covered**. There are no partial or uncovered rows.

## What the running app found that no suite did

Nothing about the manifest — but the verification itself nearly produced a false
conclusion, which is worth recording.

The first rebuild-and-reopen check showed no change, and the obvious reading was
a stale shell. It was not. Running `build:sea` to verify the executable path had
regenerated `server/src/embedded-web.ts` with 190 inlined assets, and
`server/src/index.ts` prefers that bundle over `web/dist` whenever it is
non-empty — so the server was serving a frozen snapshot and no amount of
rebuilding the interface could have changed what it served. Reset with
`scripts/ensure-embedded-web.mjs --reset`, the same rebuild was visible
immediately.

The trap is that verifying one path (the executable) silently disabled the other
(the built directory), and the symptom of that looked exactly like the defect
being hunted.
