## 1. Building an executable

- [x] 1.1 New module (`server/src/buildExe.ts`) that generates the SEA config to a temporary
      path — `mainFormat: "module"`, UTF-8 with no BOM, output named for the platform — runs
      `node --build-sea`, removes the temporary file, and returns the produced path
- [x] 1.2 Version gate: on Node < 26, take the `postject` path against `dist/sea-prep.blob`
      (copy the running `node` binary, inject with the sentinel fuse, `--macho-segment-name
      NODE_SEA` on macOS), and say which path was taken
- [x] 1.3 Refuse rather than ship broken: missing `pi-outpost.sea.mjs`, an existing file at the
      target without `--force`, a `node` binary whose major version the blob will not accept
- [x] 1.4 macOS: `codesign --remove-signature` then ad-hoc `codesign --sign -`, failing loudly
      if `codesign` is absent — an unsigned modified Mach-O is killed at launch
- [x] 1.5 Unit tests for the pure parts: the generated config's content and encoding, the
      output name per platform, the refusal cases and their messages

## 2. The command surface

- [x] 2.1 Parse `build-exe` and its `--out <path>` / `--force` in `server/src/cli.ts`, beside
      the existing subcommands; a misplaced flag is an error, not silently ignored
- [x] 2.2 Parse `--open` / `--no-open`, which apply wherever the server starts rather than to a
      subcommand
- [x] 2.3 `--help` lists `build-exe`, its options, and the browser flags
- [x] 2.4 Config key for deployments that never want a browser, validated like the others
- [x] 2.5 Tests: help output, each new flag, and every misplacement error

## 3. Opening the interface

- [x] 3.1 Open from the `listen` callback in `server/src/index.ts`, using the bound address —
      the only place that knows the real port when the config asked for `0`
- [x] 3.2 Decide on a desktop session, not a TTY: always on macOS and Windows, `DISPLAY` or
      `WAYLAND_DISPLAY` on Linux; `CI` suppresses; the flags and the config key win over all of it
- [x] 3.3 Launch through the platform opener as a detached child; catch and report failure
      without touching the server's own outcome
- [x] 3.4 Tests: the URL is built from the bound port and not the configured one, each
      suppression case, both overrides, and a failing opener leaving the server started

## 4. Executables on every release

- [x] 4.1 Matrix job in `.github/workflows/release.yml` — `macos-latest` (arm64), `macos-13`
      (x64), `ubuntu-latest`, `windows-latest` — each installing Node 26 and building its own
      executable through the new command
- [x] 4.2 Name each artifact `pi-outpost-<version>-<os>-<arch>[.exe]`, and smoke-test it in the
      job that built it (`--version` must print the released version)
- [x] 4.3 Upload them to the GitHub release for the tag
- [x] 4.4 Make `publish` depend on the matrix, so a platform that failed to build stops the
      release rather than publishing one with nothing to download

## 5. Documentation

- [x] 5.1 Rewrite `docs/sea-packaging.md` around the command and the release downloads; keep
      the manual procedure as the fallback it now is, and say what the ad-hoc signature does
      and does not buy
- [x] 5.2 State plainly that an unsigned executable warns on Gatekeeper and SmartScreen, and
      that the bundled skills are not inside it
- [x] 5.3 README: the download link as the first way to run this, ahead of `npx`

## 6. Landing it

- [x] 6.1 Build an executable and run it: it starts, serves the interface, and opens the browser
      from a double-click as well as from a terminal. **Done locally on 2026-08-22**, via the
      fallback: this machine's Node 26.7 (macOS x64) still produces `--build-sea` executables that
      segfault — a one-line hello-world reproduces it — and `build-exe`'s smoke test catches that
      and injects `sea-prep.blob` instead. The result runs, reports the released version, serves
      the UI from 190 embedded assets in a directory holding nothing but a config, and opens the
      browser with no TTY attached. The direct `--build-sea` path remains unproven on this host.
- [x] 6.6 Decide the blob's `mainFormat`: **keep it, and gate the fallback on Node >= 26.**
      The blob carries `mainFormat: "module"` because the bundle is ESM and without it the
      runtime loads it as CommonJS and dies on its first `import`; a node that predates the
      field asserts on it instead. Both were observed, and there is no version left where
      injecting this blob into an older node produces something that runs. So `buildExe.ts`
      now refuses before injecting when Node < 26, naming the version, rather than logging a
      note and handing over a binary that asserts — which is what `ARuntimeTooOldToBuild`'s
      "leaves nothing broken behind" requires. The fallback keeps its real purpose: a >= 26
      runtime whose `--build-sea` is broken, which is exactly this machine. Covered by
      "too old a Node refuses even with a blob, rather than injecting one it will reject".
- [x] 6.2 Scenario-to-test matrix for both delta specs; nothing `partial` or `uncovered`.
      `scenario-test-matrix.md`: **26 of 26 covered**. Two gaps found and closed:
      `TheTarballCarriesWhatABuildNeeds` (new `npm run check:cli` asserts the tarball carries
      both build inputs, wired into `release.yml` between the blob copy and publish) and
      `AFailedOpenIsNotAFailedStart` (new `open-browser-failure.test.mjs` boots a real server
      with the opener guaranteed to fail). The second exposed a **defect in shipped code**:
      `openBrowser` resolved `true` synchronously after `spawn`, before the `error` event
      could fire, so every failed open reported success and "could not open a browser" was
      unreachable — task 3.3's "report failure" could not happen. Now resolved from the
      `spawn`/`error` events.
- [x] 6.3 `npm run typecheck`, `npm run lint`, the suites, `npm run test:e2e`
- [x] 6.4 `openspec validate ship-standalone-executables --strict`
- [x] 6.5 Reconcile with `add-cli-update-command` — both modify `CliFlags` and the argument
      parser, so whichever lands second folds in the other rather than overwriting it.
      **Assessed 2026-08-22: nothing was overwritten.** This change landed first in
      `server/src/cli.ts`; `add-cli-update-command` never wired its subcommand in (no `update`
      in the parser, and `server/src/update.ts` + `test/update.test.ts` are still untracked).
      **Handed off deliberately**: once this change syncs its `cli` delta, that change's own
      `cli` delta goes stale — its MODIFIED `CliFlags` block reproduces the pre-`build-exe`
      text, so syncing it as-is would drop this change's paragraph and the
      `HelpDocumentsTheBuildCommand` scenario. Folding that in is `add-cli-update-command`'s
      job as the second lander, which is what design.md decided. Not pre-folded here.
