## Context

See proposal.md — Why.

What shapes the approach is how the running process can tell where it came from. Four facts are already available at runtime and cost nothing:

- `__PI_OUTPOST_VERSION__` is replaced at build time and is the string `"dev"` in a source checkout (`server/src/index.ts`) — that alone separates checkout from anything published.
- `process.execPath` and `process.argv[1]` say whether the entry point is a `.mjs` under a `node_modules/` tree or a self-contained executable.
- npm exports `npm_config_global`, `npm_execpath` and friends to scripts it runs, and npx runs from a cache directory whose path is recognisable.
- `pi-outpost` publishes one binary (`bin: dist/pi-outpost.mjs`, `files: [dist, LICENSE]`), and the GitHub release currently carries **no** binary asset — the single-file executable is a documented build procedure, not a distributed artifact.

Constraint from the existing config surface: `offline` already exists and means "make no remote request", with `--offline` and `PI_OFFLINE` layered per the standard precedence.

## Goals / Non-Goals

**Goals:**

- Decide the installation channel from evidence, and refuse when the evidence is ambiguous rather than guessing.
- Keep every update-related network request off the startup critical path, and out of the way of a process that wants to exit.
- Make the failure modes legible: a check that could not run must never read as "you are current".

**Non-Goals:**

- Self-replacing a single-file executable. It is the one channel where an update means writing over the file currently mapped into the running process, and there is no published artifact to write anyway.
- Downgrading, or installing a version the operator names. `update` moves to the newest published version or does nothing.
- Any browser-side affordance. The UI is not where an operator upgrades a server binary.

## Decisions

**Detect the channel; do not ask the operator.** A `--channel` flag would push the one question the machine can answer better than the human onto the human. Order of inference, first match wins: version is `"dev"` → checkout; entry path under an npx/`_npx` cache → ephemeral; entry path under a global `node_modules` → global install; entry point is not a `.js`/`.mjs` under `node_modules` → self-contained executable; anything else → refuse, printing what it saw. *Alternative considered:* reading `npm_config_global`. Rejected as primary evidence — it reflects the npm invocation that started the process, which is absent when the binary is run directly, and present when a wrapper script sets it.

**Run the package manager as a child process with an argv vector, never a shell string.** The same rule the RPC runtime already follows in `piRpcProcess.ts`. Nothing in the command comes from the config file or the network; the version is not interpolated (`pi-outpost@latest`, not a fetched string).

**Print the command before running it.** The operator is being asked to trust a process that modifies their machine. Showing `npm install -g pi-outpost@latest` costs one line and makes the action auditable, including in a terminal recording after the fact.

**Query the registry with `fetch`, no new dependency.** `https://registry.npmjs.org/pi-outpost/latest` answers plain JSON with a `version` field. A bounded timeout, and the response is read for that one field — nothing from it is executed, interpolated into a command, or written anywhere but the cache.

**Cache in `agentDir`, not the workspace.** The workspace belongs to the agent and may be sandboxed read-only; `agentDir` is already pi-outpost's own state. The cache holds the version seen and when, and a corrupt or unreadable cache is treated as absent rather than as an error — it is an optimisation, not a source of truth.

**Start the notice after `listen`, do not await it, and `unref` the timer.** Three separate properties: ordering (nothing before the server answers), non-blocking (no `await` in the startup path), and not holding the event loop (a pending socket must not survive Ctrl-C). The third is the one that only shows up in production, and it is why the check is scheduled rather than fired inline.

**A failed check is silent at startup and loud on the command.** Same event, two audiences. At startup the operator did not ask, so an error about a background nicety is noise. On `update --check` they did ask, so silence would be a lie and the exit code carries it.

**`offline` is a default for update checking, not a veto.** The first draft made `offline` suppress update requests outright, and a real deployment broke it: air-gapped from model catalogs, but reaching npm through an internal Nexus proxy. The two settings name different networks, and conflating them forbids checking on exactly the host where it matters most — isolated, updated rarely. So the setting is tri-state: unset follows `offline`, explicitly on beats it, explicitly off beats everything. *Alternative considered:* one `updateCheck` boolean with `offline` ignored. Rejected — a genuinely air-gapped host would then make a request that can only time out, which is the behavior `offline` exists to prevent.

**Resolve the registry rather than hardcoding it.** For the same deployment, `https://registry.npmjs.org` is unreachable. npm already knows the right address, so the order is: pi-outpost's own setting, then `npm_config_registry` (npm exports it to scripts it runs), then `npm config get registry`, then the public default. Only the direct `fetch` needs this: `npm install -g` consults npm's configuration itself, so the install path needs no registry argument and must not be given one. *Alternative considered:* always shelling out to `npm config get registry`. Rejected as the primary source — it costs a child process on a path that must not delay startup, so it is the fallback consulted only when the environment does not already answer.

## Risks / Trade-offs

- **Channel inference is wrong on a layout nobody anticipated** → the fallback is refusal with the evidence printed, not a guess; `--check` still works everywhere, since reading a version needs no channel.
- **`npm install -g` fails on permissions** → the child's own output is surfaced verbatim; pi-outpost does not retry with elevated privileges, and does not suggest it.
- **The registry is compromised or spoofed** → the request is HTTPS to the default registry, and the only thing taken from the answer is a version string used in a comparison. The install command names `@latest` rather than anything fetched, so a hostile response cannot choose what gets installed.
- **A daily cache means the notice can be a day stale** → acceptable for a nicety; `update --check` always queries live, which is the answer for anyone who needs certainty.
- **The startup notice becomes noise for someone who never updates** → it is one line, only when a newer version exists, and it has its own off switch.
- **Executing a package manager broadens what a compromised config could reach** → the command is never derived from configuration; the config can only turn checking off.

## Migration Plan

Additive. A configuration that says nothing gets the previous behavior plus a startup notice; the setting turns that off. Nothing to roll back beyond removing the subcommand.
