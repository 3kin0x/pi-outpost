## Why

The single-file executable is the answer to "I want to run this and I do not want a
toolchain". Today getting one is a manual procedure in `docs/sea-packaging.md`: write
a `sea-config.json` by hand, get `mainFormat: "module"` right, remember that the
output must end in `.exe` on Windows, and — the trap that costs the most time —
write the file without a BOM, because `Out-File -Encoding utf8` adds one and Node's
JSON parse dies on it. Get any of that wrong and the failure is a native assertion,
not a message.

Issue #14 is what an unexecutable procedure costs: a crash report, a diagnosis
("blobs are platform-specific"), and a proposed CI matrix — for a bug that was
actually a stale published blob carrying a module-format marker. Nobody could run
the procedure often enough to see that.

Two halves, and they answer different people. Someone who already has Node should
be able to type one command. Someone who does not should not need Node at all — the
whole point of a single-file executable is that the runtime is inside it.

The in-flight `add-cli-update-command` change already depends on the second half:
its answer for an operator running a single-file executable is to print the release
page, which is only useful once that page carries executables.

## What Changes

- **New `pi-outpost build-exe` subcommand**, shipped in the npm package. It writes
  the SEA config itself — correct `mainFormat`, correct encoding, platform-correct
  output name — runs the build, and prints where the executable landed.
- It SHALL refuse rather than produce a broken artifact: too old a Node, a missing
  bundle, a target path it would overwrite without being asked.
- On macOS it SHALL re-sign the result. An injected or freshly built binary with a
  stale signature is killed by the kernel at launch, and the error names neither the
  signature nor the fix.
- **Executables attached to every release**: built per platform on the tag that
  publishes, uploaded to the GitHub release. macOS (both architectures), Linux x64,
  Windows x64.
- **Starting the server opens the interface** in the default browser, at the address
  it actually bound, once it is listening — however it was started, not only from an
  executable. Someone starting `npx pi-outpost` reads an address off the terminal and
  pastes it into a browser; the software can do that itself. Suppressed where a
  browser is the wrong answer (no desktop session, a container, a backend for an
  interface hosted elsewhere), and overridable both ways.
- `--help` lists the new subcommand and the browser flags, as it lists the others.
- `docs/sea-packaging.md` stops being a procedure to follow by hand and becomes a
  description of what the command and the release artifacts do, keeping the manual
  path only as the fallback it now is.

Not in scope: code signing with a real certificate or notarisation (an unsigned
executable still warns on macOS Gatekeeper and Windows SmartScreen); Linux arm64 and
Windows arm64; self-replacement of a running executable, which stays out of the
update command's reach by design.

## Capabilities

### New Capabilities

- `standalone-executable`: what a single-file pi-outpost is, the two ways to obtain
  one — build it from the installed package, or download it from a release — and
  what it must contain, refuse, and say for itself.

### Modified Capabilities

- `cli`: the command surface gains a `build-exe` subcommand and `--open` / `--no-open`,
  which `--help` must list; a new requirement states that starting the server opens
  the interface, since that holds however the server was started rather than only for
  an executable. `PublishedCliPackage` already promises the SEA layout keeps working;
  it now also promises the package carries what building an executable needs.

## Impact

- `server/src/index.ts` — opening the browser once the server is listening, from the
  bound address rather than the configured one.
- `server/src/config.ts` — the key that turns opening off for a deployment.
- `server/src/cli.ts` — a further subcommand and its flags; help text. Lands beside
  the `update` subcommand from `add-cli-update-command`; whichever merges second
  rebases onto the other's parsing.
- New module for the build: config generation, the Node version gate, the postject
  fallback, the macOS re-sign.
- `cli/scripts/build.mjs` — the new module has to reach the published package, and
  `pi-outpost.sea.mjs` and `sea-prep.blob` are already there for it to act on.
- `.github/workflows/release.yml` — a matrix job producing the artifacts and
  uploading them to the release. The publish job currently switches Node versions
  midway to build the blob; the executable build belongs beside it, not inside it.
- `docs/sea-packaging.md` — rewritten around the command.
- No runtime dependency added: `--build-sea` is Node's own, and `postject` is only
  reached for on the fallback path, where it is invoked through `npx`.
