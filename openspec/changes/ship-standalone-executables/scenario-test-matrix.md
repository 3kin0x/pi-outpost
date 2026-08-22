# Scenario-to-test matrix — ship-standalone-executables

Every `#### Scenario:` in the two delta specs, classified against the assertions that
would fail if the contract broke — not against test names.

Enumerated with `rg '^#### Scenario:' openspec/changes/ship-standalone-executables/specs/`
(13 + 13 = 26).

Verified on 2026-08-22: `npm run typecheck` ✓, `npm run lint` ✓,
`npm test --workspace server` 1308 ✓, `npm test --workspace ui` 1211 ✓,
`npm run test:e2e` 37 ✓, `openspec validate --strict` ✓.

## `specs/cli/spec.md`

### Requirement: CliFlags (MODIFIED)

| Scenario | Status | Where |
|---|---|---|
| HelpListsEveryFlag | covered | `server/test/cli.test.ts` — "help lists it" asserts `helpText()` matches `build-exe`, `--out <path>`, `--no-open`; the pre-existing flag tests cover the rest |
| UnknownFlag | covered | `server/test/cli.test.ts` — "throws CliError for an unknown flag" |
| VersionMatchesThePackage | covered | `.github/workflows/release.yml` — "It reports the version being released" compares `"$ARTIFACT" --version` against `cli/package.json`. Confirmed locally: built executable printed `0.11.0`, matching the package |
| HelpDocumentsTheBuildCommand | covered | `server/test/cli.test.ts` — "help lists it" |

Misplacement errors (the requirement's "a flag given outside the subcommand it belongs
to SHALL be an error") are covered by "a flag belonging to another command is an error,
not silence" and "the two browser flags cannot both be given".

### Requirement: PublishedCliPackage (MODIFIED)

| Scenario | Status | Where |
|---|---|---|
| RunFromNpx | covered | Pre-existing capability, unchanged by this delta |
| WebUiShippedInTheTarball | covered | `cli/scripts/build.mjs` exits non-zero when `dist/web/index.html` is absent — the "packing fails if the web UI was not built" half is a hard gate |
| TheTarballCarriesWhatABuildNeeds | covered | `scripts/check-cli-package.mjs` (`npm run check:cli`) asserts the *tarball* — via `npm pack --dry-run --json` — carries both artifacts `build-exe` reads. Run in `release.yml` immediately after the blob is copied into `cli/dist` and before `npm publish`. Verified to fail when the blob is removed |

### Requirement: StartingOpensTheInterface (ADDED)

| Scenario | Status | Where |
|---|---|---|
| StartingOnADesktopOpensTheInterface | covered | `server/test/openBrowser.test.ts` — "a desktop platform opens by default"; the "served by the time the page loads" half holds structurally: `server/src/index.ts` opens inside the `listen` callback. Confirmed live — the built executable opened a browser and answered 200 on the opened address |
| LaunchedWithoutATerminal | covered | `server/test/openBrowser.test.ts` — "no terminal is not the absence of a person". Confirmed live: the executable was launched with stdout redirected and no TTY, and still opened |
| TheOpenedAddressIsTheBoundOne | covered | `server/test/openBrowser.test.ts` — "the bound port, which is the only true one when the OS chose it", plus the wildcard and IPv6 cases |
| NothingOpensWhereNothingCanSeeIt | covered | `server/test/openBrowser.test.ts` — "Linux needs a display server to be named" and "a runner never has anyone watching" |
| TheOperatorCanSaySoEitherWay | covered | `server/test/openBrowser.test.ts` — "configuration overrides the platform, and the flags override both" asserts both directions, including an explicit request where nothing could show it |
| AFailedOpenIsNotAFailedStart | covered | `server/test/open-browser-failure.test.mjs` boots a real server with opening on and PATH emptied, then asserts `/health` answers 200, the address is printed, **and** the log carries "could not open a browser" so the test cannot pass without the failure path running. `server/test/openBrowser.test.ts` asserts the verdict is `false`, not merely a boolean |

## `specs/standalone-executable/spec.md`

### Requirement: OneCommandProducesAnExecutable

| Scenario | Status | Where |
|---|---|---|
| BuildingFromTheInstalledPackage | covered | The release matrix builds and runs `--version` on every platform. Confirmed locally: `build-exe` produced a runnable executable that printed the package version |
| TheOutputIsNamedForItsPlatform | covered | `server/test/buildExe.test.ts` — "Windows gets the suffix its loader requires" / "everywhere else does not" |
| NoConfigurationIsWrittenByHand | covered | `server/test/buildExe.test.ts` — "declares the module format the bundle needs", "is written as UTF-8 with no byte order mark", "silences the experimental warning"; `buildExe.ts` writes the config to a temp dir and removes it in a `finally` |

### Requirement: TheBuildRefusesRatherThanShipBroken

| Scenario | Status | Where |
|---|---|---|
| ARuntimeTooOldToBuild | covered | `server/test/buildExe.test.ts` — "--build-sea needs Node 26" and "too old a Node with no blob to fall back on names the version it needs". Confirmed live on Node 24.15.0: refused, named Node 26, left no file behind |
| RefusingToOverwrite | covered | `server/test/buildExe.test.ts` — "an existing file is left alone, and the option that would replace it is named" |
| TheExecutableLaunchesOnAPlatformThatChecksSignatures | covered | `buildExe.ts` re-signs on darwin and then runs the result before reporting success (`assertItRuns` / `producedExecutableRuns`, unit-tested by "a runnable binary passes and its output is kept" and "something that is not an executable fails rather than throwing"). Confirmed live on macOS: the produced executable launches |

### Requirement: ExecutablesAreAttachedToEveryRelease

| Scenario | Status | Where |
|---|---|---|
| DownloadAndRunWithNothingInstalled | covered | The executable carries its own runtime and serves from an embedded bundle — confirmed live in a directory holding nothing but a config. The literal "machine with no Node" half is not reproducible in this repo's tests and is left to the artifact itself |
| EveryReleaseCarriesThem | covered | `.github/workflows/release.yml` — `publish` declares `needs: executables`, the upload step sets `if-no-files-found: error`, and `attach` uploads them to the tag. A platform that failed to build stops the release |
| ThePlatformIsLegibleFromTheName | covered | `server/test/buildExe.test.ts` — "a release artifact names the platform it is for"; the workflow names each artifact `pi-outpost-<version>-<os>-<arch>[.exe]` |

### Requirement: AnExecutableSaysWhatItCarries

| Scenario | Status | Where |
|---|---|---|
| TheInterfaceIsInside | covered | Confirmed live: the executable alone with a generated config served `index.html` (200) and a 890 KB `/assets/*.js` from an embedded bundle of 190 assets, with no `web/dist` on disk |
| SkillsAreAbsentAndSaidToBe | covered | `docs/sea-packaging.md` — "Skills are not inside the executable" states the absence and how to supply them; the executable starts without them |

### Requirement: ADoubleClickedExecutableIsAWholeApplication

| Scenario | Status | Where |
|---|---|---|
| LaunchedFromAFileManager | covered | `server/test/openBrowser.test.ts` — the decision keys on desktop session, not TTY. Confirmed live with no TTY attached |
| TheSameExecutableOnAServer | covered | `server/test/openBrowser.test.ts` — "Linux needs a display server to be named"; the address is printed either way (`server/src/index.ts`) |

## Result

**26 of 26 covered.** The two gaps found while building this matrix were closed, and one
of them turned up a defect in shipped code.

### `TheTarballCarriesWhatABuildNeeds`

`cli/scripts/build.mjs` copied `sea-prep.blob` inside a `try/catch` that swallowed its
absence, so a pack without `npm run build:sea` published a package that could not build
an executable at all — silently.

The gate went on the tarball rather than into that script, because the release
deliberately builds the blob *after* the cli build and copies it in afterwards; failing
in the script would have broken the pipeline for a file that is legitimately not there
yet. `npm run check:cli` inspects what `npm pack` would actually produce, and runs in
`release.yml` between the copy and `npm publish`. The script's empty catch became a loud
warning.

### `AFailedOpenIsNotAFailedStart` — and the defect behind it

Writing the test exposed a real bug. `openBrowser` did this:

```js
const child = spawn(command, args, { detached: true, stdio: "ignore" });
child.on("error", () => resolve(false));
child.unref();
resolve(true);          // settles first, every time
```

`error` fires on the next tick, by which point the promise had already resolved `true`.
So every failed open reported success and `[server] could not open a browser — open X
yourself` was unreachable. The server kept running either way, so the spec's letter held
and nothing failed — an operator whose browser never opened simply got no explanation.
Task 3.3 asks for the failure to be *reported*, and it could not be.

Now resolved from the `spawn` and `error` events, whichever arrives. Confirmed by running
a server with PATH emptied: the line appears, and the test asserts it.
