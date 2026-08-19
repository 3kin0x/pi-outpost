## Why

Nothing in pi-outpost tells an operator that the version they are running is old, and nothing helps them move off it. They have to know the package name, remember the right npm incantation for how they happen to have installed it, and think to check at all — so in practice they do not, and a fixed bug stays unfixed on their machine. Releases now ship often enough for that gap to matter.

The trap is that "update" means four different things depending on how the binary is running, and a command that ignores the difference is worse than none: running `npm install -g` from a working checkout installs a *second* copy and leaves the running one untouched, while telling the operator they are up to date.

## What Changes

- New `pi-outpost update` subcommand that upgrades the installation it is actually running from.
- New `pi-outpost update --check` that reports what is available and changes nothing.
- The command SHALL detect its installation channel and act accordingly, refusing rather than guessing:
  - **global npm install** — the case worth automating: runs the install and prints the command first.
  - **npx** — already fetches the latest on every run; it says so instead of pretending to act.
  - **repository checkout** — refuses and points at `git pull`; overwriting a working tree is not an update.
  - **single-file executable** — no self-replacement; prints the release page.
- A **non-blocking** startup notice when a newer version exists: never awaited, cached with a daily TTL, silent when there is nothing to say and silent when the check fails.
- Update checking SHALL respect `offline` / `PI_OFFLINE`, and SHALL be disableable on its own.
- Installing SHALL never happen automatically — only on the explicit command.

Not in scope: updating the pi SDK or an RPC child's own executable, and any in-browser update affordance.

## Capabilities

### New Capabilities
- `update`: discovering that a newer pi-outpost exists, and upgrading the installation in place, per distribution channel.

### Modified Capabilities
- `cli`: the command surface gains an `update` subcommand and its `--check` flag, which `--help` must list.
- `config`: a key that turns the startup check off, alongside the existing `offline` behavior it must honor.

## Impact

- `server/src/cli.ts` — argument parsing for a fourth subcommand and its flag; help text.
- `server/src/index.ts` — the deferred startup check, placed after the server listens and unref'd so a pending request cannot hold the process open on Ctrl-C.
- `server/src/config.ts` — the opt-out key and its validation.
- New module for channel detection and the registry query; new cache file under `agentDir`.
- Network: one request to the npm registry, at most once per TTL, never on the startup path's critical section. No new runtime dependency — the registry answers plain JSON over `fetch`.
- Security surface: the command executes a package manager on the operator's behalf. It is explicit, prints what it will run, and never replaces a binary it did not install through npm.
