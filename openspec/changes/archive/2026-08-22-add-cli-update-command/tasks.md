## 1. Channel detection and version lookup

- [x] 1.1 Add a module that infers the installation channel from the build-time version, the entry
  path and the package layout, in the order design.md fixes, returning an explicit "unknown" rather
  than a guess.
- [x] 1.2 Add the registry lookup: one bounded HTTPS request, the `version` field read and nothing
  else taken from the response, distinguishing "newer exists", "current", and "could not check".
- [x] 1.3 Add the cache under `agentDir` — version and timestamp, an unreadable or corrupt file
  treated as absent.
- [x] 1.4 Test channel detection for each channel including the unknown fallback, the lookup against
  a stub registry (found, current, unreachable, malformed answer), and cache read/write/expiry.
- [x] 1.5 Resolve the registry address in order — pi-outpost's setting, `npm_config_registry`,
  `npm config get registry`, public default — and test each step of that chain.

## 2. The `update` command

- [x] 2.1 Parse the `update` subcommand and its `--check` flag; make `--check` outside `update` the
  same error as any other misplaced flag, and list both in `--help`. **Was ticked without being
  done**: `server/src/cli.ts` had no `update` command, no `--check`, and no help entry, so
  `runUpdateCommand` had no caller and none of section 2 was reachable. Wired 2026-08-22.
- [x] 2.2 Implement `--check`: report running and newest version, exit zero when current, non-zero
  when the check failed, and never claim currency after a failure.
- [x] 2.3 Implement the install path for a global package install: print the exact command, run it
  as an argv vector without a shell, surface the child's output verbatim, and report the version
  moved to.
- [x] 2.4 Implement the refusals with their actionable message and non-zero exit — checkout points
  at version control, ephemeral run explains the next invocation already fetches, self-contained
  executable points at the release page, unknown channel prints what it saw.
- [x] 2.5 Test each channel's outcome, that `--check` writes and installs nothing in every case, and
  that the printed command matches the one executed.

## 3. Startup notice and configuration

- [x] 3.1 Add the tri-state update-check key (unset follows `offline`, explicitly on beats it,
  explicitly off beats everything) and the optional registry key, each validated with an error
  naming the setting.
- [x] 3.2 Schedule the check after the server listens: not awaited, `unref`'d so a pending request
  cannot hold the process open, silent when current and silent on failure.
- [x] 3.3 Apply the suppression rules: `offline` with the key unset, the key explicitly off, a source
  checkout, and a cached result still within the interval — while an explicitly enabled key still
  checks under `offline`.
- [x] 3.4 Make the check command refuse with a configuration reason rather than attempting a request
  when checking is disabled.
- [x] 3.5 Test that startup is not delayed by a slow registry, that the process exits with a check in
  flight, that a fresh cache makes no request, and each suppression rule.

## 4. Documentation and verification

- [x] 4.1 Document the command, the `--check` flag, the per-channel behavior and the config key in
  `--help` and the README, including that nothing installs automatically.
- [x] 4.2 Build the scenario-to-test matrix from every `#### Scenario:` in this change, classifying
  each covered/partial/uncovered with its test name.
- [x] 4.3 Exercise the command against a real global install and a real checkout, confirming the
  first upgrades the copy being run and the second refuses without installing a second copy.
- [x] 4.4 Run focused tests, then the server and UI suites, then
  `openspec validate add-cli-update-command --strict`.

## 5. Found while landing it

- [x] 5.1 A pending startup check held the process open. The abort timer was `unref`'d and the
  socket was not — `fetch` exposes no handle for it — so stopping a server with a check in flight
  waited out the ten-second registry timeout. Invisible against any registry that refuses quickly.
  The request is now `node:https` with an unref'd socket (a deliberate deviation from design.md's
  `fetch`, which cannot satisfy the requirement; no dependency added either way). The test that
  proves it uses a local listener that accepts and never replies — a reserved address like
  192.0.2.1 refuses in ~150 ms and passed against the broken code.
- [x] 5.2 A checkout was told it was the newest published version. `isNewer("0.11.0", "dev")` is
  false, and false was read as "current", which also left every channel refusal behind an early
  return it could never pass. Added a fourth `VersionCheck` state, `incomparable`, and moved the
  channel decision ahead of the version comparison.
- [x] 5.3 Prerelease versions were ordered as text, so `1.2.0-rc.10` read as older than
  `1.2.0-rc.2` and anyone on rc.2 was told they were current. Now compared per SemVer precedence,
  identifier by identifier. Found by the Codex review on the previous change.
- [x] 5.4 Folded `ship-standalone-executables`' `CliFlags` paragraph and its
  `HelpDocumentsTheBuildCommand` scenario into this change's `cli` delta — this change lands
  second, which is the order design.md fixed.
- [x] 5.5 The command printed nothing. `pi-outpost update --check` exited 13 — node's code for an
  unsettled top-level await — with no verdict at all, so the feature did nothing while 35 of 35
  scenarios were covered. The unref that 5.1 added is right for the background notice and wrong
  for the command, which awaits it at top level with nothing else pending: the loop emptied before
  the registry answered. The unref is now the caller's decision and defaults to off. Missed
  because **every scenario injected a `fetchImpl`** — the real request was never on an asserted
  path. Added `TheCheckOutlivesNothingButItselfIsNotCutShort` and
  `server/test/update-command-process.test.mjs`, which drives the real socket from a child that
  awaits the command the way index.ts does; both tests fail against the old code. Found by running
  the binary while preparing the 0.12.0 release.
