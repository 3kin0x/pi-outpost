# Extend the programmatic API for supervising hosts

**Status**: answered upstream by the openlore change `extend-api-for-supervising-hosts`, which
accepts all seven asks. Its decisions correct three of them: the descriptor contract gets its own
subpath rather than `"."` (because `"."` statically re-exports `openloreAnalyze` and therefore
loads the analyzer); `openloreServe` needs `startServe` split into a side-effect-free core rather
than wrapped; and the reuse path becomes `ifRunning: 'reject' | 'adopt'` with `ServeHandle.owned`
rather than a handle whose `close()` silently does nothing. Their answers to the four questions at
the end: a third subpath; disk is authoritative for health; no `files` scope on index state; "do
not spawn" rather than an injected endpoint. Ask 8 (optional feature dependencies) landed as their
Decision 9.

Two follow-ups this integration surfaced afterwards, neither blocking and neither yet proposed:
the AST chunker's fallback is silent — a missing native grammar produces no `indexDegradations`
entry, unlike LanceDB's, so a quietly worse index is indistinguishable from a good one; and
`@lancedb/lancedb` pulling `@huggingface/transformers` through its own optional dependencies means
"I want the vector store" and "I want a local embedding runtime" cannot be chosen separately.

**Target**: `openlore` (observed at 3.1.0)
**Origin**: integrating OpenLore natively into pi-outpost, a multi-workspace agent host. The
asks below are the seven places where that integration had to work around the published surface
rather than use it.

## Context: what the consumer looks like

pi-outpost is an agent host that holds **several projects open at once**, each with its own
session, sandbox, file watcher and history. It wants to give each project's agent OpenLore's
structural tools, natively — through the Pi package, not MCP — and it wants to own the runtime
lifecycle: start, supervise, report state, restart with a bound, release on close.

Three properties of that host shape every ask here:

1. **Several working trees at once, including several git worktrees of one repository.** Two
   worktrees on different branches are different source trees, so they are different indexes.
   Identity is the working tree, never the repository.
2. **A failure must be isolated.** An analysis crash may not take down the process serving every
   other project, so the analyzer never runs in the host process — it runs in a supervised child.
3. **A standalone distribution.** The host ships as a single executable carrying its own Node,
   for machines with nothing installed. It carries OpenLore as a versioned payload and runs it
   with the runtime it already has.

The integration works today. Every ask below replaces host-side code that exists only because
the corresponding fact or capability is not published.

## The gap

The published surface is `dist/api/index.js`:

```
openloreInit, openloreAnalyze, openloreGenerate, openloreVerify, openloreDrift,
openloreRun, openloreAudit, openloreGetSpecRequirements,
openloreRecordDecision, openloreConsolidateDecisions, openloreSyncDecisions,
OpenLoreError, errors, isOpenLoreError  (+ types)
```

`openloreAnalyze` is close to ideal for a host: `rootPath`, `configPath`, `quiet`, `signal`,
`onProgress` with `{phase, step, status, detail}`, and a result that names its own degradation
(`degraded: {artifact, reason: 'missing'|'corrupt'}`, `indexDegradations[]`). Ownership is
already cross-process, and `AnalysisInProgressError` carries `owner`, `elapsedMs`,
`heartbeatAgeMs`. That is exactly the shape a supervising host needs.

What is not published: **health**, **index freshness**, **daemon lifecycle**, **the serve
descriptor contract**, **analysis status without provoking an error**, and **a read of the
federation registry**.

There is no fallback either — the `exports` map publishes two subpaths:

```jsonc
{ ".": "./dist/api/index.js", "./cli": "./dist/cli/index.js" }
```

so `openlore/dist/cli/commands/serve.js` is `MODULE_NOT_FOUND`, and `./cli` is the binary's entry
point (shebang, `node-version-bootstrap`, `heap-bootstrap`) rather than a library. That closure
is right, and this proposal does not ask to weaken it — it asks to widen `"."`.

## Asks

Ordered by leverage. 1 and 2 are exports of code that already exists.

### 1. Export the serve-descriptor contract

```ts
export {
  readServeDescriptor, readServeDescriptorState, validateServeDescriptor,
  validateServeHealth, serveHttpBaseUrl, canonicalServeRoot, SERVE_PROTOCOL_VERSION,
} from '../cli/commands/serve-descriptor.js';
export type { ServeDescriptor, ServeHealth, ServeDescriptorRead };
```

**Why.** `serve-descriptor.ts` describes itself as "the ONE validator" for
`.openlore/serve.json`, an attacker-writable artifact that becomes a fetch target, and states its
own doctrine: *"One threat model must not have three postures."* A host outside the package that
wants to discover a daemon becomes a fourth reader — and, without an export, a fourth reader with
a **hand-copied** validator that will drift from yours. That is the precise failure the module
was extracted to prevent, reproduced one package boundary away.

We chose not to copy it, and paid for that in capability rather than in risk: pi-outpost
allocates its own loopback port and token, spawns the daemon with them, and proves it through
`GET /health` — so it never reads the descriptor at all. What that costs is **reuse**. When a
working tree already has a healthy daemon — a terminal `pi`, an editor, a second host — we cannot
recognise it, so we neither adopt nor supervise it; we stand beside it. That is exactly the "one
warm process per repo" outcome `serve-client.ts` exists to produce, and an embedding host cannot
participate in it without this export.

The module is already dependency-light by contract (node builtins plus the loopback predicate,
so the Pi host can import it without pulling in the analyzer), which means exporting it does not
weigh down `dist/api/index.js`.

**Unlocks**: an embedding host that adopts and supervises an existing daemon instead of standing
beside one.

### 2. Export the daemon lifecycle

```ts
export interface ServeApiOptions extends BaseOptions {
  host?: string;            // default 127.0.0.1
  port?: number;            // 0 = ephemeral
  token?: string;
  preset?: string;
  watch?: boolean;          // default true
  idleTimeoutMs?: number;   // 0 disables
}
export interface ServeHandle {
  port: number; host: string; baseUrl: string; token?: string;
  close(): Promise<void>;
}
export function openloreServe(options: ServeApiOptions): Promise<ServeHandle>;
```

`startServe` and `ServeHandle` already exist in `cli/commands/serve.ts`, and `ServeHandle`
already exists *for this reason* — its own comment says it is returned "so callers (tests) can
address and shut down the running server without signalling the process". A supervising host
wants exactly what the tests want.

Differences from the CLI options worth settling: numbers rather than strings (`port`,
`idleTimeoutMs` in ms rather than `--idle-timeout` in minutes), no `--stop`, and a handle-or-throw
return instead of `ServeHandle | undefined`.

**Why.** Today a host spawns the CLI binary and then has: no typed error on failure, a PID to
manage instead of a `close()`, and — in a single-file distribution with no Node on the machine —
an extra re-entry path built solely to exec that binary. With this export the daemon becomes a
supervised call inside the host's own child process: one child per working tree instead of two,
and `close()` instead of a kill or an unauthenticated race with `POST /shutdown`.

**Replaces**: binary spawning, PID management, and one distribution code path.

### 3. `openloreHealth` — functional readiness as a value

```ts
export interface HealthResult {
  runtime: 'available' | 'unavailable';
  index: 'absent' | 'building' | 'ready' | 'degraded';
  indexDegradations?: AnalyzeIndexDegradation[];
  watcher?: 'healthy' | 'stopped' | 'unknown';
  repairInProgress?: boolean;
  reason?: string;               // typed code + message when not ready
}
export function openloreHealth(options?: BaseOptions): Promise<HealthResult>;
```

**Why.** A supervising host must never report "ready" because a process is alive. The
distinctions it needs — runtime available, API responsive, index present and whole, watcher
healthy, background repair running — are ones OpenLore already draws internally
(`/health`, `parse-health-boundary`, `index-staleness`, `freshness`, `get_health_map`). Today a
host assembles them by parsing the daemon's `/health` payload and inferring the rest from the
shape of an analyze result. That is inference where a fact would do, and it couples the host to a
transport payload rather than a contract.

**Replaces**: host-side inference over `/health` plus analyze-result shape.

### 4. `openloreIndexState` — does the index represent the working tree?

```ts
export interface IndexStateResult {
  matchesWorkingTree: boolean;
  fingerprint?: string;
  reason?: 'no-index' | 'fingerprint-mismatch' | 'unbaselined';
}
export function openloreIndexState(options?: BaseOptions): Promise<IndexStateResult>;
```

**Why.** A host must treat a branch or HEAD change as a *snapshot transition*, not a file edit:
the tree becomes a different tree, and analysis computed before it is not merely stale, it is
about something else. The question "does the index still represent this tree?" therefore gets
asked at every checkout — and today the only way to answer it is a full `analyze({force: true})`,
where a comparison would do.

The ingredient already exists: `federation/registry.ts` reads
`.openlore/analysis/fingerprint.json` for precisely this staleness judgement about *peer* repos.
This ask is the same judgement about the local one.

**Replaces**: a forced re-analysis per checkout.

### 5. `openloreAnalysisStatus` — ask the lock instead of tripping over it

```ts
export interface AnalysisStatusResult {
  inProgress: boolean;
  owner?: AnalysisOwnerPayload;
  elapsedMs?: number;
  heartbeatAgeMs?: number;
}
export function openloreAnalysisStatus(options?: BaseOptions): Promise<AnalysisStatusResult>;
```

**Why.** `AnalysisInProgressError` already carries all three fields, so the facts exist; they are
just only reachable by starting an analysis that then fails. A host that wants to *report*
"reconciling, owned by another process, healthy heartbeat" should not have to provoke an error to
learn it — especially when the honest response is to not start a competing analysis at all.

**Replaces**: provoking `AnalysisInProgressError` as a status probe.

### 6. Read-only federation listing

```ts
export function openloreFederationList(options?: BaseOptions): Promise<{
  repos: FederationRepoEntry[];
  states: ConsultedRepo[];   // includes RepoIndexState per peer
}>;
```

**Why.** A host that isolates workspaces must be able to *say* what a federated answer covered,
and must be able to prove it never writes the registry. Reading is enough — registration stays an
explicit user act through your CLI and tools. `FederationRepoEntry`, `ConsultedRepo` and
`RepoIndexState` are already well-shaped types; only the read and the types are missing from `"."`.

### 7. Let a supervising host be authoritative over the daemon

Not an API export — an escape hatch in the Pi extension:

- an environment variable or config key (e.g. `OPENLORE_PI_NO_SPAWN=1`, or
  `pi.daemon.spawn: false`) that makes the extension **discover and use** a daemon but never
  spawn one.

**Why.** `ensureDaemon(cwd)` spawning its own daemon is right when nothing else manages one. When
a host already supervises a daemon per working tree — with a restart bound, retained diagnostics,
and a released handle at shutdown — the extension's spawn produces a second, unsupervised process
that can outlive the session, and it silently defeats the host's "stop retrying" policy after
repeated failures.

Note `ensureDaemonResult` already accepts a `launch` override, but the exported entry point
`ensureDaemon(cwd)` does not, and the default extension goes through the latter.

## What this proposal deliberately does *not* ask for

**Exporting `dispatchTool` so a host can run tools without the daemon.** It exists, it is pure,
and exporting it would make a daemon-free path conceivable. It should not be done, for reasons
that are yours:

- `serve-client.ts` states the point of delegation directly — "a single process holds the warm
  caches and runs ONE watcher for a repo, so two agents … don't each spin a watcher racing to
  write the same `.openlore/analysis`." A multi-workspace host is that situation by construction,
  plus whatever the user runs in a terminal on the same tree. Removing the daemon multiplies
  watchers on one index.
- In-process dispatch means *in the host's process*: the analyzer would load into the process
  serving every project, which is the isolation the host exists to provide. It would end up in a
  child anyway — and then a homemade IPC would be replacing a tested one (loopback bind, validated
  descriptor, constant-time token, DNS-rebinding guard, `/health` identity proof).
- The Pi extension has no in-process path today; it throws `PiDaemonConnectionError`. The graceful
  fallback belongs to the stdio MCP server through `serve-client`. Removing the daemon would mean
  changing the extension, and re-routing its tools host-side is exactly the reimplementation a
  thin adapter must refuse.

The daemon is the right design. These asks make it something a host **holds and closes** rather
than something it spawns and interrogates.

## Compatibility and house rules

- Every ask is **additive**: new exports on `"."`, no signature changes, no behavioural change to
  existing functions.
- The `exports` map stays closed apart from `"."` — no deep-import surface is requested.
- New functions follow the existing API contract: `BaseOptions` (`rootPath`, `configPath`,
  `quiet`, `signal`, `onProgress`), console-silent, never controlling the process, typed errors
  through `OpenLoreError` / `isOpenLoreError`.
- Asks 3–6 are reads: no writes, no LLM, no provider configuration required. A host that only
  indexes must never need generation configured — which is already true of `openloreAnalyze` and
  should stay true of these.
- `scripts/api-consumer-smoke.mjs` (`npm run test:api-consumer`) is the natural place to cover the
  new exports from outside the package, and `audit:packlist` must stay green.

## Suggested sequencing

1. Asks **1 and 2** — pure exports of existing code, and together they remove a copied security
   validator and a spawned binary from every embedding host.
2. Asks **3 and 4** — the readiness and freshness facts; these are what let a host report state
   honestly instead of inferring it.
3. Asks **5 and 6** — small reads over data that already exists.
4. Ask **7** — extension-side, independent of the rest.

## Questions for maintainers

- Is `"."` the right home for the serve-descriptor contract, or would a third subpath
  (`openlore/serve`) suit the dependency story better?
- Should `openloreHealth` consult a running daemon when one is discoverable, or answer purely from
  disk? A host would like the disk answer to be meaningful with no daemon at all.
- Does `openloreIndexState` want a `files?: string[]` scope, mirroring `openloreDrift`?
- Would you rather ask 7 were expressed as "honour an injected endpoint" (host passes a descriptor
  or base URL) than as "do not spawn"?
