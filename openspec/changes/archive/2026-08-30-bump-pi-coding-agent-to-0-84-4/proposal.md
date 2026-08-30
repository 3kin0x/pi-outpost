## Why

pi-outpost runs on `@earendil-works/pi-coding-agent`, pinned at `^0.84.3` with the
lockfile holding it at 0.84.3. Upstream 0.84.4 is now the default channel, and it
carries fixes on paths this project actually stands on: a Windows shell abort that
crashed pi when `taskkill.exe` was not on `PATH`, a resumed session corrupting the
next appended entry when its JSONL file had no trailing newline, and large tool
results being sent to the provider before compaction rather than after.

Nothing here is a new capability for pi-outpost. It is the floor moving under it, and
the reason to move now is that two of those fixes touch the session transcripts this
project reads and the platform it has the least visibility into.

## What Changes

- Raise the dependency from `^0.84.3` to `^0.84.4` in `server` and `cli`, and refresh
  the lockfile so a fresh install and CI resolve the same version. The caret already
  admitted 0.84.4; only the lockfile held it back, so the pin is raised as well to
  state the floor rather than leave it to whoever next runs an update.
- Verify, rather than assume, that the version pi-outpost supervises over RPC and the
  one it embeds in the SEA bundle are both 0.84.4, and that the SEA build still
  produces a working executable.
- Fix the version the interface reports. `PI_SDK_VERSION` was a bundle-time define
  with a literal `"dev"` fallback, so every server not built into an executable told
  its operator `pi SDK: dev` — the shape most people run while working. It now reads
  the installed package when the define is absent, and still says nothing rather than
  guessing when it cannot. Found by task 3.3, which asked whether the interface names
  0.84.4 and got `dev` back.
- No other pi-outpost behaviour changes, and no new upstream API is adopted. Two additions
  in 0.84.4 would be worth their own change and are deliberately out of scope here:
  the `ui_prompt_start` / `ui_prompt_end` extension events, which overlap with the
  dialog tracking this server already does in `RpcRuntime`, and the RPC `clear_queue`
  command, which has no caller.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `api`: what the state snapshot says is answering prompts. The bump itself changes no
  requirement — the upstream fixes change how pi behaves, not what pi-outpost promises,
  and the change was opened with `skip_specs: true` for that reason. The version-reporting
  fix does change observable behaviour, so the marker was removed and the contract
  written down: the SDK or the child is named, exactly one of the two, in every run
  shape, and a version that cannot be read is never invented.

## Impact

- `server/package.json`, `cli/package.json`, `package-lock.json` — the pin and the
  resolved version.
- The SEA build (`server/scripts/build-sea.mjs`) and `cli/scripts/build.mjs` bundle
  pi; the unpacked package grows ~76 kB, and `engines.node` is unchanged at
  `>=22.19.0`, so the Node floor and the SEA toolchain are untouched.
- The comments in `cli/scripts/build.mjs`, `server/scripts/build-sea.mjs` and
  `server/test/seaExtensionImports.test.ts` cite 0.84.3 as the version that fixed
  `earendil-works/pi#8237` upstream. That statement stays true and the guard stays
  needed; they are not rewritten.
- `server/src/piSdkVersion.ts` (new) and its use in `server/src/index.ts`, with
  `server/test/piSdkVersion.test.ts` and `server/test/versionsWire.test.mjs`.
- Risk concentrates in the RPC runtime, where pi-outpost drives a real `pi --mode rpc`
  child: the release changed how extension messages are ordered around tool results
  and when compaction runs. Those paths are exercised by the server suite and by a
  live run, not by reading the changelog.
