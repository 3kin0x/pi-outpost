# Scenario-to-test matrix — add-cli-update-command

Every `#### Scenario:` in the three delta specs, classified against the assertions that
would fail if the contract broke — not against test names.

Enumerated with `rg '^#### Scenario:' openspec/changes/add-cli-update-command/specs/`
(5 + 8 + 23 = 36).

Verified on 2026-08-22: `npm run typecheck` ✓, `npm run lint` ✓, server suite ✓,
ui suite ✓, `openspec validate add-cli-update-command --strict` ✓.

## `specs/cli/spec.md`

### Requirement: CliFlags (MODIFIED)

The delta folds in `ship-standalone-executables`' paragraph and its
`HelpDocumentsTheBuildCommand` scenario. Both changes modify this requirement, and
this one lands second, so it carries the other's content forward rather than
replacing it — the order `design.md` fixed.

| Scenario | Status | Where |
|---|---|---|
| HelpListsEveryFlag | covered | `server/test/cli.test.ts` — "help lists it" and "help lists update and its flag" |
| UnknownFlag | covered | `server/test/cli.test.ts` — "throws CliError for an unknown flag" |
| VersionMatchesThePackage | covered | `server/test/cli.test.ts` — "--version returns version command"; the release workflow asserts the built executable prints the released version |
| HelpDocumentsTheBuildCommand | covered | `server/test/cli.test.ts` — "help lists it" asserts `build-exe`, `--out <path>`, `--no-open` |
| HelpDocumentsTheUpdateCommand | covered | `server/test/cli.test.ts` — "help lists update and its flag"; "the update subcommand and --check are recognised"; "--check outside update is an error, not silence" covers the misplacement half |

## `specs/config/spec.md`

### Requirement: UpdateCheckSetting

| Scenario | Status | Where |
|---|---|---|
| UpdateCheckOnByDefault | covered | `server/test/update.test.ts` — "nothing configured means yes"; `config.test.ts` — "updateCheck stays a tri-state" asserts unset stays `undefined` rather than defaulting to a stored value |
| OfflineDisablesItWhenUnset | covered | `server/test/update.test.ts` — "offline turns it off while the key is unmentioned", and the suppression loop in "the startup notice" asserts no request is made |
| ExplicitlyOnOverridesOffline | covered | `server/test/update.test.ts` — "asking for it explicitly beats offline" and "explicitly enabled still checks under offline", the latter asserting the request count |
| ExplicitlyOffOverridesEverything | covered | `server/test/update.test.ts` — "turning it off explicitly beats everything" |
| InvalidUpdateCheckValue | covered | `server/test/config.test.ts` — "updateCheck refuses a value that is not a boolean" |

### Requirement: UpdateRegistrySetting

| Scenario | Status | Where |
|---|---|---|
| RegistryOverrideIsUsed | covered | `server/test/update.test.ts` — "pi-outpost's own setting wins over everything"; `config.test.ts` — "updateRegistry is optional and taken as given" |
| RegistryUnsetResolvesFromTheEnvironment | covered | `server/test/update.test.ts` — "npm's exported variable is used when nothing is configured" and "the public registry is the last resort, not the first choice" |
| InvalidRegistryValue | covered | `server/test/config.test.ts` — "updateRegistry refuses anything that is not an http(s) URL", including a well-formed `ftp://` URL |

## `specs/update/spec.md`

### Requirement: UpdateReportsWhatIsAvailable

| Scenario | Status | Where |
|---|---|---|
| CheckFindsANewerVersion | covered | `server/test/update.test.ts` — "a newer version is reported with both numbers, and nothing is installed" |
| CheckFindsNothingNewer | covered | `server/test/update.test.ts` — "being current says so and exits zero" |
| CheckCannotReachTheRegistry | covered | `server/test/update.test.ts` — "a registry it cannot reach is a failure, never a claim of currency", which asserts the exit code *and* that no currency claim appears |
| TheCheckOutlivesNothingButItselfIsNotCutShort | covered | `server/test/update-command-process.test.mjs` — both tests drive the real `registryRequest` against a real socket from a child that awaits `runUpdateCommand` at top level, as index.ts does. One asserts a verdict is printed and the exit code is 0; the other asserts a hanging registry becomes a reported failure and exit 1. Both fail without the fix, with exit 13 and no output |

### Requirement: UpdateActsOnTheRunningInstallation

| Scenario | Status | Where |
|---|---|---|
| UpgradesAGlobalPackageInstall | covered | `server/test/update.test.ts` — "a global install is upgraded with the command that was printed" asserts the printed and executed commands are the same string. Exercised for real against a scratch prefix: `npm install -g --prefix … pi-outpost@latest` moved a real global install 0.10.0 → 0.11.0 in place |
| RefusesToUpgradeARepositoryCheckout | covered | `server/test/update.test.ts` — "a checkout is refused and pointed at version control", asserting no install. Confirmed live from this checkout: refused, named `git pull`, exit 1 |
| ExplainsThatAnEphemeralRunIsAlreadyCurrent | covered | `server/test/update.test.ts` — "an ephemeral run is told its next invocation already fetches" |
| RefusesToReplaceASelfContainedExecutable | covered | `server/test/update.test.ts` — "an executable refuses to replace itself and points at the releases" |

The unknown-channel fallback is covered by "an unrecognised layout prints what it saw
rather than guessing", and the rule that a channel this command cannot upgrade is
refused *whatever* the version comparison says by "a channel that cannot be upgraded
is refused even when nothing is newer".

### Requirement: UpdateNeverInstallsWithoutBeingAsked

| Scenario | Status | Where |
|---|---|---|
| CheckOnlyInstallsNothing | covered | `server/test/update.test.ts` — "installs nothing on every channel, whatever the verdict" loops all five channels against a spy |
| StartupNeverInstalls | covered | `server/test/update.test.ts` — "says a thing and remembers a thing, and installs nothing" pins the complete set of effects: one line of output and one cache file, nothing else appearing in the agent directory |

### Requirement: StartupNoticeIsNonBlocking

| Scenario | Status | Where |
|---|---|---|
| StartupIsNotDelayedByTheCheck | covered | `server/test/update-startup.test.mjs` — boots a real server pointed at a socket that accepts and never answers, asserting it serves well inside the registry timeout |
| PendingCheckDoesNotHoldTheProcessOpen | covered | `server/test/update-startup.test.mjs` — a child process whose only pending work is the check exits immediately. See "The defect this found" below |
| RepeatedStartsDoNotRepeatTheQuery | covered | `server/test/update.test.ts` — "a fresh cached answer is used, and no request is made" asserts a request count of zero; "a stale cached answer is replaced by a fresh query" is the other side |
| FailedCheckSaysNothingAtStartup | covered | `server/test/update.test.ts` — "is silent when the check fails, and remembers nothing", which also asserts the failure is not cached over the next real answer |

### Requirement: UpdateCheckingIsSeparableFromOfflineOperation

| Scenario | Status | Where |
|---|---|---|
| OfflineSuppressesTheStartupCheckByDefault | covered | `server/test/update.test.ts` — suppression loop, asserting zero requests |
| ExplicitCheckingSurvivesOfflineOperation | covered | `server/test/update.test.ts` — "explicitly enabled still checks under offline" |
| DisabledCheckingWinsRegardlessOfOffline | covered | `server/test/update.test.ts` — suppression loop covers the key off both with and without `offline` |
| CheckCommandRefusesRatherThanHanging | covered | `server/test/update.test.ts` — "configuration that disabled checking is named, and no request is made", asserting the registry was never reached |
| CheckoutIsNotComparedAtStartup | covered | `server/test/update.test.ts` — "a checkout is never compared, whatever the settings say", and the suppression loop asserts no request and no output |

### Requirement: UpdateChecksUseTheConfiguredRegistry

| Scenario | Status | Where |
|---|---|---|
| UsesThePackageManagerRegistry | covered | `server/test/update.test.ts` — "npm's exported variable is used when nothing is configured" |
| ConfiguredOverrideWins | covered | `server/test/update.test.ts` — "pi-outpost's own setting wins over everything" |
| FallsBackToThePublicRegistry | covered | `server/test/update.test.ts` — "the public registry is the last resort, not the first choice" |
| TheInstallUsesTheRegistryTheCheckUsed | covered | `server/test/update.test.ts` — "a configured registry is passed to the installer, so check and install agree", which also asserts the printed command still matches the executed one; "no override leaves the command bare, so npm reads its own configuration" is the other side |

## Result

**36 of 36 covered.** Several things were found on the way, both by writing a test the
spec asked for rather than by review.

### The defect 35 of 35 did not find: the command printed nothing at all

Found by running the binary while preparing the 0.12.0 release, not by any test.
`pi-outpost update --check` printed no verdict and exited 13 — node's code for an
unsettled top-level await. The whole feature did nothing, and every scenario was
covered.

`registryRequest` unref'd its socket unconditionally, which is right for the background
notice and wrong for the command: the command awaits it at top level with nothing else
pending, so the event loop emptied before the registry answered. The unref is now the
caller's decision, defaulting to a ref'd request — an answer that arrives late costs
some seconds, where an answer that never arrives costs the answer.

The reason 35 scenarios missed it is one line: **every one of them injected a
`fetchImpl`**. The real request was never on any asserted path. `TheCheckOutlives...`
is the scenario that now says so, and its tests drive the real socket from a child
process. A matrix is proof about the code the tests reach.

### The defect this found: a pending check held the process open

`PendingCheckDoesNotHoldTheProcessOpen` looked satisfied — the abort timer was already
`unref`'d, with a comment saying a pending check must never keep the process alive. It
did anyway. `fetch` exposes no handle to `unref`, so the request's socket kept the
event loop alive until it settled, and "stop the server" became "wait out the ten
second registry timeout".

It was invisible against every registry that refuses quickly, which is every registry
until the one that hangs. The first version of the test used a reserved address
(192.0.2.1) and passed against both the broken and the fixed code, because a host with
no route to it refuses in about 150 ms and nothing is ever pending. Rewritten against
a local listener that accepts and never replies, the test failed — and fails again if
either `unref` is removed, which is how it is known not to be decorative.

The fix replaces `fetch` with `node:https` for this one request so there is a socket to
`unref`. That is a deviation from `design.md`'s "query the registry with `fetch`",
taken deliberately: no dependency is added either way, and `fetch` cannot satisfy the
requirement. The test seam narrowed from `typeof fetch` to a three-field
`RegistryResponse`, which is the shape every stub already returned.

### A checkout was told it was up to date

`isNewer("0.11.0", "dev")` is false, and false was being read as "current" — so a
working tree was told `pi-outpost dev is the newest published version`, and the
checkout refusal sat behind that early return where it could never run. Two changes:
a fourth `VersionCheck` state, `incomparable`, for a running version that was never on
the same scale; and the channel is now consulted *before* the version, so an
installation this command cannot upgrade is refused whether or not something newer
exists.

That second one is why "a channel that cannot be upgraded is refused even when nothing
is newer" exists: the refusals were only reachable in a release where a newer version
happened to be published.

### Also fixed here

Prerelease ordering compared identifiers as text, so `1.2.0-rc.10` read as older than
`1.2.0-rc.2` and anyone on rc.2 was told they were current. It only appears once a
series reaches double digits. Now compared per SemVer precedence, identifier by
identifier, numerics numerically.

### Found by the Codex review, after the matrix was first written

- **A project's own dependency was classified as a global install.** `node_modules`
  anywhere in the entry path meant "global", so `./node_modules/.bin/pi-outpost` would
  have run `npm install -g` — upgrading or creating a *different* copy and reporting
  success for the local one still running, which is the exact failure
  `UpdateActsOnTheRunningInstallation` exists to prevent. The global root is now asked
  of npm (`npm_config_prefix`, then `npm root -g`) and the path must be inside it;
  when it cannot be discovered the answer is "unknown", which refuses and prints the
  evidence rather than guessing at a destination. Verified live: this machine's
  discovered root matches `npm root -g`, a real global entry resolves to `global`, and
  a local dependency to `unknown`.
- **The install ignored a configured registry.** `updateRegistry` steered the check and
  not the installation, so an update could be announced from an internal proxy and
  fetched from the public registry. `--registry` is now passed when — and only when —
  pi-outpost's setting overrode npm's. See design.md, which records the narrowing.
- **`update` swallowed real configuration errors.** The command tolerated a missing
  config file on purpose, via a bare `catch` that also swallowed an explicit
  `--config` path that does not exist and an invalid `updateCheck`. Only `NoConfigError`
  is tolerated now; anything else is reported and stops, because ignoring a setting
  could mean making a request the operator had switched off.
