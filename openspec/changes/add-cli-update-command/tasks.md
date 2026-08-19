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
  same error as any other misplaced flag, and list both in `--help`.
- [ ] 2.2 Implement `--check`: report running and newest version, exit zero when current, non-zero
  when the check failed, and never claim currency after a failure.
- [ ] 2.3 Implement the install path for a global package install: print the exact command, run it
  as an argv vector without a shell, surface the child's output verbatim, and report the version
  moved to.
- [ ] 2.4 Implement the refusals with their actionable message and non-zero exit — checkout points
  at version control, ephemeral run explains the next invocation already fetches, self-contained
  executable points at the release page, unknown channel prints what it saw.
- [ ] 2.5 Test each channel's outcome, that `--check` writes and installs nothing in every case, and
  that the printed command matches the one executed.

## 3. Startup notice and configuration

- [ ] 3.1 Add the tri-state update-check key (unset follows `offline`, explicitly on beats it,
  explicitly off beats everything) and the optional registry key, each validated with an error
  naming the setting.
- [ ] 3.2 Schedule the check after the server listens: not awaited, `unref`'d so a pending request
  cannot hold the process open, silent when current and silent on failure.
- [ ] 3.3 Apply the suppression rules: `offline` with the key unset, the key explicitly off, a source
  checkout, and a cached result still within the interval — while an explicitly enabled key still
  checks under `offline`.
- [ ] 3.4 Make the check command refuse with a configuration reason rather than attempting a request
  when checking is disabled.
- [ ] 3.5 Test that startup is not delayed by a slow registry, that the process exits with a check in
  flight, that a fresh cache makes no request, and each suppression rule.

## 4. Documentation and verification

- [ ] 4.1 Document the command, the `--check` flag, the per-channel behavior and the config key in
  `--help` and the README, including that nothing installs automatically.
- [ ] 4.2 Build the scenario-to-test matrix from every `#### Scenario:` in this change, classifying
  each covered/partial/uncovered with its test name.
- [ ] 4.3 Exercise the command against a real global install and a real checkout, confirming the
  first upgrades the copy being run and the second refuses without installing a second copy.
- [ ] 4.4 Run focused tests, then the server and UI suites, then
  `openspec validate add-cli-update-command --strict`.
