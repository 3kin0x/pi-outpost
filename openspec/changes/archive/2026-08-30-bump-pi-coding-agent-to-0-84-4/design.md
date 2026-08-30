## Context

See proposal.md — Why. What shapes the approach is that pi reaches this project by
three different routes, and a version bump has to be checked on all three:

- **Embedded** — the default. The SDK session runs inside the server process, from
  `node_modules`.
- **RPC** — the server supervises a real `pi --mode rpc` child (`RpcRuntime`,
  `piRpcProcess`), where the executable is whatever is on the operator's machine and
  need not be the version in the lockfile at all.
- **SEA** — `server/scripts/build-sea.mjs` bundles pi into a self-contained
  executable, and `cli/scripts/build.mjs` carries a workaround for an extension-import
  gap that upstream fixed in 0.84.3.

The lockfile is the only thing holding 0.84.3 today; `^0.84.3` already admits 0.84.4.

## Goals / Non-Goals

**Goals:**
- One resolved version — 0.84.4 — for a fresh install, CI, and the SEA bundle alike.
- Evidence from each of the three routes, not from the changelog.

**Non-Goals:**
- Adopting anything new in 0.84.4. `ui_prompt_start` / `ui_prompt_end` and RPC
  `clear_queue` are left alone; see proposal.md — What Changes.
- Rewriting the comments that cite 0.84.3 as the version that fixed pi#8237. That
  sentence stays true, and the guard it explains stays necessary.
- Raising the Node floor. `engines.node` is `>=22.19.0` in both versions.

## Decisions

**Raise the pin as well as the lockfile.** The caret already permitted 0.84.4, so
refreshing the lock alone would work. It would also leave the declared floor at a
version this change is deliberately moving off, and the next `npm update` would be
what states the intent. Raising `^0.84.3` → `^0.84.4` in `server` and `cli` says it
once, where it is read.

Alternative considered: `npm update` only, no manifest edit. Rejected — the diff would
be a lockfile with no statement of why.

**Verify the RPC route with a live child, not a fake.** `piRpcProcess` parses a
version string from a real handshake, and 0.84.4 changed how extension messages are
ordered around tool results. A stub answers whatever the test author expects, which is
exactly the failure mode this project has been bitten by before. One short live run
against the installed 0.84.4 binary settles it.

Alternative considered: trust the server suite. Rejected — it runs against the
harness, and the harness is what would be kind to us.

**Read the version from the package, and keep the define for the bundle.** The SDK's
own runtime `VERSION` resolves the wrong `package.json` inside a SEA, which is why the
define exists — but that is an argument for preferring it in a bundle, not for
answering `"dev"` where the package is on disk. Resolution uses `import.meta.resolve`,
because the package declares `exports` with no CJS main and `createRequire().resolve`
raises `ERR_PACKAGE_PATH_NOT_EXPORTED`; the walk-up then checks each manifest's `name`
rather than trusting a fixed depth, so a layout change reports nothing instead of a
nested dependency's version. A plausible wrong number is worse than a placeholder.

Alternative considered: call the SDK's exported `VERSION`. Rejected — that is the
value the define exists to avoid.

**Keep the rest to no code change.** If a fix in 0.84.4 turns out to require
an adjustment in pi-outpost, that is a separate change with its own reasoning, not a
line smuggled into a bump.

## Risks / Trade-offs

- **A behaviour change lands in the RPC path unnoticed** (message ordering around tool
  results, compaction timing) → exercise a real turn with tool use over RPC, and read
  the transcript back rather than the exit code.
- **The SEA bundle grows or stops building.** The package gained ~76 kB unpacked →
  build the SEA executable and run it, since the bundle is where an import gap would
  surface first.
- **The operator's `pi` on `PATH` is not 0.84.4.** The RPC mode uses their binary, so
  the lockfile does not govern it → nothing to fix here, but the version pi-outpost
  reports in the interface is what tells them, and it should be read during the check.
- **Rollback is cheap and should stay cheap** → one commit touching two manifests and
  the lockfile; reverting it restores 0.84.3 exactly.

## Migration Plan

No migration. Install, verify, commit. To roll back, revert the commit and run
`npm install` — the lockfile carries the previous integrity hash.
