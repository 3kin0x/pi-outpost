## Context

See proposal.md — Why. What shapes the approach:

- The package already ships everything a build needs: `dist/pi-outpost.sea.mjs` (all
  dependencies and the web UI inlined) and `dist/sea-prep.blob`. Nothing new has to
  be fetched; what is missing is the code that drives them.
- Two build paths exist and they are not equivalent. `node --build-sea` needs Node
  ≥ 26 and produces the executable directly. The older path injects `sea-prep.blob`
  into a copy of the `node` binary with `postject`. Issue #14 was that path failing
  because the published blob carried a module-format marker; `server/scripts/build-sea.mjs`
  now deletes `mainFormat` for the distributed blob and keeps it only for the native
  build.
- `release.yml` is one job that switches from Node 24 to Node 26 midway to build the
  blob, then publishes. Its browser suite already moved to a container image in #80.
- `add-cli-update-command` is in flight and modifies the same requirement (`CliFlags`)
  and the same file (`server/src/cli.ts`).

## Goals / Non-Goals

**Goals:**

- One command produces a working executable, with no file the operator writes.
- A release is a complete answer for someone with no toolchain.
- Starting the server lands a person in the interface, whatever they started it with.

**Non-Goals:**

- Real code signing or notarisation. The ad-hoc signature this applies is what makes
  a modified binary *launch*; it is not what makes Gatekeeper or SmartScreen quiet.
- Cross-building. Each platform's executable is built on that platform.
- Self-replacement of a running executable.
- Embedding the bundled skills. That stays a documented absence.

## Decisions

### A subcommand, not a separate binary

`pi-outpost build-exe` rather than a second `bin` entry. The package already declares
one binary and the surface already carries subcommands (`init`, `login`, and `update`
in flight); a second entry point would be a second thing to discover, document and
keep in `--help`.

### The config is generated, never authored

Every documented failure of the current procedure is a detail of that file: the BOM
that `Out-File -Encoding utf8` adds and Node's parser rejects, `mainFormat: "module"`
missing, an output name without `.exe`. Generating it removes the whole class. It is
written to a temporary path and removed afterwards, so nothing is left in the
operator's directory to be edited and re-used incorrectly.

### `--build-sea` first, `postject` as the stated fallback

On Node ≥ 26 the direct build is one call and needs no external tool. Below that, the
blob path still works and is what an operator on Node 24 has. The fallback is taken
automatically and *says* it is being taken, because the two produce subtly different
artifacts and someone debugging needs to know which one they have.

### macOS re-signing is part of producing the artifact, not advice

An injected or freshly built Mach-O whose signature no longer matches is killed at
launch with a message that names neither. So the build runs `codesign --remove-signature`
then an ad-hoc `codesign --sign -`, and fails loudly if the tool is absent, rather
than handing over an executable that dies. Ad-hoc is enough to launch locally; it is
not a distribution signature, which is why notarisation is a non-goal rather than an
oversight.

### The browser is opened from the bound address, after `listen`

Opening before the server listens gives an error page and an operator who concludes
it is broken. So the open happens in the callback that already knows the bound
address — which is also the only place that knows the real port when the config asked
for `0`.

**The decision to open keys on a desktop session, not on a TTY.** The obvious test —
"is stdout a terminal" — inverts the case that matters most: a double-clicked
executable has no terminal and is precisely where nobody will read a printed address.
So: macOS and Windows always have a desktop; on Linux, `DISPLAY` or `WAYLAND_DISPLAY`
must be set. Containers and remote shells fall out correctly, and `CI` remains an
explicit suppressor.

Launching uses the platform opener (`open`, `start`, `xdg-open`) as a detached child
whose failure is caught and ignored beyond a printed line. A browser that will not
start is not a reason for a server to stop.

### Release artifacts come from a matrix job that gates publish

A separate job per platform, `needs`-ed by publish, rather than more steps inside the
publish job: three platforms cannot be one job, and an executable that failed to
build should stop the release rather than leave a version published with no downloads
attached. `macos-latest` gives arm64 and `macos-13` x64; Linux and Windows are x64
runners. Node 26 is installed per job because that is what `--build-sea` requires.

Artifacts are named `pi-outpost-<version>-<os>-<arch>[.exe]`, which is what makes the
right download legible without documentation.

### Coordination with `add-cli-update-command`

Both changes modify `CliFlags` and `server/src/cli.ts`. This delta is written against
the current main spec, so whichever archives second must fold in the other's
paragraph rather than overwrite it — the same for the argument parser. Worth doing in
that order deliberately: `update` first, since its "print the release page" answer is
only true once this change has put executables on that page.

## Risks / Trade-offs

- **The tag now depends on three more builds.** A macOS runner failing blocks a
  release that would otherwise have shipped. → The publish job is what they gate; a
  re-run of the failed job is enough, and no npm publish has happened yet at that
  point.
- **An unsigned executable warns on download.** Gatekeeper and SmartScreen both flag
  it. → Stated in the release notes and in the docs; real signing is a separate
  decision with a cost (certificates, notarisation service) that this change does not
  take on.
- **A browser opening unasked is a nuisance in the wrong context.** → Suppressed
  wherever a browser cannot be shown, overridable in both directions, and never fatal.
- **Two build paths mean two artifacts to reason about.** → The command says which
  one it took; the spec requires both to produce something that runs.
- **The blob path depends on a `node` binary the operator has.** Its major version
  must match what the blob expects. → The fallback checks and refuses with the
  version rather than producing a binary that asserts at startup, which is exactly
  how issue #14 presented.

## Migration Plan

Nothing to migrate: the manual procedure keeps working, and the documentation keeps
it as the fallback. Ship order is the command first (it is testable without a
release), then the release job, then the documentation rewrite that points at both.
