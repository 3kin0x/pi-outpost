# Scenario-to-test coverage

Scope: the delta this change adds — `specs/api/spec.md`, one requirement,
`TheSnapshotNamesWhatAnswersPrompts`, four scenarios. Enumerated with
`rg '^#### Scenario:' openspec/changes/bump-pi-coding-agent-to-0-84-4/specs/`, which
reports exactly those four; the delta declares only `## ADDED Requirements`, so no
existing `api` requirement is modified and none of the main spec's other scenarios
come into scope. The rest of the change is a dependency bump with no delta of its own.

| Scenario | Status | Test |
|---|---|---|
| ADistributedBuildNamesItsSdk | covered | `server/test/versionsBundled.test.mjs` — both build shapes: the npm bundle, and the no-externals bundle an executable embeds |
| ARunFromSourceNamesItToo | covered | `server/test/versionsWire.test.mjs` — "a server run from source names the SDK it has installed, not a placeholder" |
| AnUnreadableVersionIsNotInvented | covered | `server/test/versionsBundled.test.mjs` — a real server that cannot resolve the SDK; plus three failure shapes in `piSdkVersion.test.ts` |
| AChildIsNamedInsteadOfTheSdk | covered | `server/test/versionsWire.test.mjs` — "a supervised child is named instead of the SDK, and never alongside it" |

## Evidence, assertion by assertion

### ADistributedBuildNamesItsSdk

> GIVEN a server running from a self-contained executable
> WHEN a client connects
> THEN the snapshot names the pi SDK version that was built into it

The version reaches a distributed build as a bundle-time substitution
(`__PI_SDK_VERSION__`), and a source run is precisely the shape that define is absent
from — so no test of a source run can observe it. `versionsBundled.test.mjs` bundles the
real `server/src/index.ts` with esbuild and starts the result through the harness's
`entry` option, added for this, then reads `versions.piSdk` off the WebSocket. The
substituted sentinel is deliberately unlike any real version —
`424.242.42-sdk-from-the-bundle` — so a build that dropped the define, or a call site
that preferred the on-disk read, reports the installed `0.84.4` and the equality fails.
`piOutpost` is asserted the same way, which is what would catch the two defines being
crossed.

Both shapes the project ships are driven, because they are different esbuild builds and
either could lose the define on its own:

- the npm package's bundle — five externals, `node22` — which must sit inside the repo,
  since Node resolves those externals by walking up from the file;
- the bundle a self-contained executable embeds — no externals, `node26` — run from
  outside the repo entirely, so nothing it reports can have come from resolving our
  tree.

What the executable adds over that second bundle is postject and a blob, not another
opportunity to substitute a version, and it cannot be built in this suite: it needs
Node >= 26 and several minutes. The end-to-end run was done by hand and is recorded in
task 2.3 — the built executable reports `{piOutpost: "0.17.0-beta.1", piSdk: "0.84.4"}`.

Where the number comes from is guarded separately on every push: `piSdkVersion.test.ts`,
"every build script inlines the installed version rather than leaving a build to guess",
reads both build scripts, finds all three `__PI_SDK_VERSION__` define sites
(`cli/scripts/build.mjs` twice — the npm bundle and its SEA-ready twin — and
`server/scripts/build-sea.mjs` once), and asserts each is `JSON.stringify(piSdkVersion)`
and that each script derives `piSdkVersion` by parsing the installed package's manifest.
The site count is asserted too, so a fourth define site that hardcoded a literal fails
rather than passing unseen.

### ARunFromSourceNamesItToo

> GIVEN a server started from source, with the SDK installed alongside it
> WHEN a client connects
> THEN the snapshot names that installed SDK's version
> AND it is not the placeholder

`versionsWire.test.mjs` starts a real server from the TypeScript source — the shape
that reported `dev` before this change — and reads `versions` off the `hello` frame.
Three assertions: `piSdk !== UNKNOWN_VERSION`, so the regression this change fixes
cannot come back; `piSdk` matches `/^\d+\.\d+\.\d+/`, so a non-version string does not
pass; and `piSdk === readInstalledPiSdkVersion()`, computed in the test process, so the
wire must carry exactly what the module answers, with nothing substituted on the way.
The unit side is `piSdkVersion.test.ts`: "reports what the installed manifest says,
whatever that is" pins the answer to the manifest on disk rather than to a literal, so
it stays true across upgrades and still fails if the two disagree; "walks up to the
package that bears the name, not to the nearest manifest" builds a tree where a nested
`impostor` manifest sits between the entry point and the real one, and fails if the
walk-up reports `1.2.3` instead of `9.9.9`.

### AnUnreadableVersionIsNotInvented

> GIVEN a server that cannot read the installed SDK's version
> WHEN a client connects
> THEN the snapshot carries the placeholder rather than a version the server guessed at

Driven at the boundary, in the one shape where the condition is real rather than
simulated. `versionsBundled.test.mjs` bundles the server with every dependency inlined
and *no* version defines, and runs it from `os.tmpdir()` — nothing above it is a
`node_modules`. The server works: its dependencies are in the bundle. What it cannot do
is resolve `@earendil-works/pi-coding-agent` to read a version, which is a self-contained
executable's situation exactly. The wire must then carry `dev` and not a number: a
server that fell back to any plausible version fails here. `piOutpost` is asserted the
same way.

Three unit tests drive the three ways the reading itself fails, each asserting
`UNKNOWN_VERSION` and not a number: the resolver throws (`Cannot find module`); nothing
on the way up bears the package name (a manifest reading `something-else@4.5.6` is *not*
reported as the SDK's version, which is the invented answer this scenario forbids); and
a manifest that bears the name but carries no version. These go through the injected
`ResolveEntry`, because those particular shapes cannot be produced in a process that has
the package installed.

That the placeholder is not replaced downstream is the `piSdk === readInstalledPiSdkVersion()`
assertion in `versionsWire.test.mjs`: the wire carries the module's answer verbatim, so a
second fallback bolted on at the call site fails there.

### AChildIsNamedInsteadOfTheSdk

> GIVEN a server whose conversation is served by a supervised agent child
> WHEN a client connects
> THEN the snapshot names that child, and does not also name an SDK version

`versionsWire.test.mjs` starts a server in `rpc` mode against
`test/fixtures/fake-pi-rpc.mjs` (sandbox off — RPC refuses to be paired with one, the
child builds its own toolset) and asserts both halves of the exclusion: `versions.agent`
is truthy, and `versions.piSdk` is `undefined`. The second assertion is the one that
matters for the requirement's "exactly one of the two, never both" — naming both would
tell an operator that two different things answer their prompts.

## Runs

- `server/test/piSdkVersion.test.ts`, `versionsWire.test.mjs`, `versionsBundled.test.mjs`: 12 passed, 0 failed.
- Full server suite after the fix: 1611 passed, 0 failed, 0 skipped, 0 cancelled.
- UI suite: 63 files, 1346 tests passed.
- Playwright: 46 passed.
- `openspec validate bump-pi-coding-agent-to-0-84-4 --strict`: valid.
