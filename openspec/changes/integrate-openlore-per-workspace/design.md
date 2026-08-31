## Context

See proposal.md — Why. What follows is what the two sides provide, established by reading
openlore 3.1.0's published package, measuring it, running its API against a throwaway repository,
and reading openlore's own answer to the integration asks this change produced (its change
`extend-api-for-supervising-hosts`).

**This design targets an openlore that carries that change.** Every decision below is written
against the surface it publishes. The measurements and behaviours are from 3.1.0, which is what
exists today.

### OpenLore offers two supported surfaces, and this change needs both

**The programmatic API** — openlore's package `main`. In 3.1.0 it exports `openloreInit`,
`openloreAnalyze`, `openloreGenerate`, `openloreVerify`, `openloreDrift`, `openloreRun`,
`openloreAudit`, `openloreGetSpecRequirements`, the decision functions and typed errors
(`OpenLoreError`, `isOpenLoreError`, `ErrorCode`). `extend-api-for-supervising-hosts` adds
`openloreServe`, `openloreHealth`, `openloreIndexState`, `openloreAnalysisStatus`,
`openloreFederationList`, and a second export subpath, `openlore/serve-descriptor`.

Four properties of `openloreAnalyze` decide this design:

- every call takes `BaseOptions`: `rootPath`, `configPath`, `quiet`, an `AbortSignal`, and an
  `onProgress` callback receiving `{ phase, step, status: 'start'|'progress'|'complete'|'skip',
  detail }`. Progress and cancellation are supplied rather than invented;
- it returns `fromCache`, `degraded: { artifact, reason: 'missing' | 'corrupt' }` and
  `indexDegradations: [{ index, reason }]`. Index integrity is something OpenLore *tells* us,
  which is what `ReadinessIsProvedFunctionally` requires and what stops Outpost inventing a
  second integrity check;
- it throws `AnalysisInProgressError` carrying `owner`, `elapsedMs`, `heartbeatAgeMs`. Analysis
  ownership is a cross-process advisory lock OpenLore already holds;
- it is console-silent and never controls the process.

It also throws `OpenLoreError` with code `no-config` on a project with no `.openlore/config.json`
— verified by running it. That is the `auto` mode's answer for a project OpenLore cannot serve,
and it is why Outpost never needs to call `openloreInit` on a user's behalf.

**Importing the API loads the analyzer.** openlore's own design states it: `src/api/index.ts`
statically re-exports `openloreAnalyze` → `analysis-core` → `call-graph` → tree-sitter, so
`import … from 'openlore'` loads the analyzer graph eagerly, called or not. This is why the
descriptor contract gets its own subpath upstream, and it is a hard constraint on where our
adapter may put an import (D2).

**The Pi extension** — `package.json`'s `pi` block names `./dist/pi/extension.js` and `./skills`.
The extension registers ~45 native Pi tools (`orient`, `get_subgraph`, `analyze_impact`,
`search_code`, `check_spec_drift`, `record_decision`, `select_tests`, …) and a
`before_agent_start` context injection. It is not an MCP client: each tool call is an HTTP `fetch`
to a warm local daemon. `@earendil-works/pi-coding-agent`, `pi-ai`, `pi-tui` and `typebox` are
openlore's *dev* dependencies — the extension expects its Pi host to supply them, which pi-outpost
already does.

### The daemon behind the tools

`openlore serve --directory <root>` is a loopback HTTP server — `GET /health`,
`POST /tool/:name {directory,args}`, `POST /shutdown` — keeping the analyzer's caches warm, and
with `--watch` re-analysing on file changes with a debounced full repair. It announces itself by
writing `<root>/.openlore/serve.json` (`port`, `pid`, `host`, `token`, `protocolVersion`,
`startedAt`, `version`, `state: ready|draining`), validated by a single shared validator —
loopback host only, integer port and pid, token string, matching protocol version — and proved
through `/health`, which answers with the canonical root it serves, its pid, its preset, its tool
list, and whether the token authenticated.

One warm daemon per repository is the point, not an accident. openlore's `serve-client` states it:
delegation exists so that "a single process holds the warm caches and runs ONE watcher for a repo,
so two agents … don't each spin a watcher racing to write the same `.openlore/analysis`."

### Discovery is already by working tree

The descriptor lives inside the tree analysed, `/health` proves the root, and every API call is
rooted at `rootPath`. `.openlore/` is gitignored here, so two git worktrees of one repository
already have two `.openlore/` directories, two descriptors, two daemons and two indexes. The
isolation this change requires is the shape OpenLore already has; what is missing is an owner.

### Federation

`<root>/.openlore/federation.json` is an index-of-indexes: peers by absolute path plus the index
fingerprint captured at registration. Nothing is merged; a federated query loads the peer indexes
it needs and attaches a coverage block naming which peers were consulted and which were skipped
(`indexed` / `unbaselined` / `stale` / `unindexed` / `missing`). It is per home repository, and
registration is an explicit act.

### What the dependencies actually cost, measured

`npm install openlore` in this repository took `node_modules` from 655 MB to **1.7 GB**. Nearly
all of it is openlore's `optionalDependencies` — `@huggingface/transformers` (→ `onnxruntime-node`,
212 MB), `@lancedb/lancedb`, `apache-arrow`, `protobufjs`, and seventeen native tree-sitter
grammars. Its *hard* dependencies additionally include a Vite/React toolchain and an MCP SDK that
this integration never loads.

What each optional group actually buys, established by running `openloreAnalyze` against a
throwaway repository with none of them installed:

| Package group | Role | Without it | Verdict |
|---|---|---|---|
| `@lancedb/lancedb` + `apache-arrow` | **stores all three search indexes** | `indexDegradations` names it for `function`, `text` *and* `spec`; no search at all | required |
| `@huggingface/transformers` + onnx | computes embeddings **locally** | a configured remote embedder, or keyword ranking inside the same store | not carried |
| 17 native tree-sitter grammars | AST-aligned chunking for embedding (`ast-chunker.js`, `await import()` in a `try/catch`) | `blankLineChunk`; slightly worse chunks | not carried |

The call graph — what `orient`, `get_subgraph` and `analyze_impact` rest on — runs on
`tree-sitter-wasms` + `web-tree-sitter`, which are hard dependencies. The native grammars carry no
language coverage. The measured degradation without LanceDB is explicit:

```
indexDegradations = [
 { index: 'function', reason: "Cannot find package '@lancedb/lancedb' … vector-index.js" },
 { index: 'text',     reason: "Cannot find package '@lancedb/lancedb' … text-line-index.js" },
 { index: 'spec',     reason: "Cannot find package '@lancedb/lancedb' … spec-vector-index.js" }]
```

Analysis completes; the graph and the artifacts are built; search is what is lost. That result is
what makes LanceDB a carried dependency rather than an optional one (D12).

### What Outpost already has

`Workspace` (server/src/workspace.ts) owns a project's session, sandbox, roots, git probe,
watcher, toolset and work plan, and its identity is the resolved root path. `buildRuntimeFor`
(server/src/index.ts) builds either an embedded SDK session — Pi extensions arrive as
`additionalExtensionPaths`, skills as `additionalSkillPaths` — or a supervised `pi --mode rpc`
child, where the same resources travel as `--extension` and `--skill` arguments. Workspaces are
built lazily, retired when idle, and already report per-project activity and attention to every
client.

Two assumptions are recorded rather than asked: the capability defaults to `auto` (the proposal
puts "mandatory where it cannot serve" out of scope), and both agent runtimes are supported (the
architecture spec requires the frontend to be runtime-independent).

## Goals / Non-Goals

**Goals:**

- One supervisor per workspace over runtimes OpenLore already knows how to run, with the
  supervised state, health and diagnostics the specs name.
- An adapter thin enough that its whole job is: resolve the runtime, hold a daemon handle, ask
  OpenLore for health and freshness, drive an analysis when the snapshot changes, and hand the
  agent runtime one extension path and one skills path.
- A standalone executable that carries the analysis runtime — search included — and runs it with
  the Node it already contains.

**Non-Goals:**

- Wrapping, renaming or re-shaping OpenLore's tools. The agent sees OpenLore's own surface.
- Any Outpost-side registry, graph, traversal, conflict detection or index verification. If the
  answer exists in OpenLore, Outpost asks for it.
- A federation UI, or Outpost registering peers on the user's behalf.
- Anything that drives an LLM. Spec generation, repair, verification and drift are the agent's
  work through OpenLore's skills, not the server's; Outpost calls none of those API functions.
- Using the analysis for Outpost's own features. Feeding Work Plan evidence or review summaries
  from `openloreAudit`, `openloreVerify` or the decision APIs is later, generic work.

## Decisions

### D1 — Two lanes over the two surfaces: the API indexes, the daemon answers

Outpost's own lane is **code intelligence only**: the first index, reconciliation after a snapshot
transition, health, freshness. It goes through the **programmatic API** — `openloreAnalyze`,
`openloreHealth`, `openloreIndexState`, `openloreAnalysisStatus`, `openloreServe`, and nothing
else.

The agent's lane — every structural question — goes through the **Pi extension** and its warm
daemon, unchanged and unwrapped.

**Generation is neither lane.** `openloreGenerate`, `openloreVerify`, `openloreRun`,
`openloreDrift` and `openloreAudit` drive an LLM and write specs. That is the agent's work, done
through OpenLore's own skills when the user asks for it — not something a server initiates on a
project's behalf. Outpost therefore calls none of them, needs no LLM provider configured for
OpenLore, and never writes into `openspec/`.

*Alternative rejected: drive everything through the daemon's tool endpoint.* No progress, no
cancellation, and no way to say "this artifact is corrupt"; readiness would collapse to "a process
is up".

*Alternative rejected: drive everything through the API.* There is no `orient` in it, and
re-implementing the tools over it is the reimplementation this change forbids.

### D2 — The analyzer never runs, nor loads, in the pi-outpost process

`openloreAnalyze` runs the analyzer where it is called. Worse for a host: openlore's `"."` barrel
*statically* re-exports it, so merely importing `openlore` loads the analyzer graph — tree-sitter
included — into the importing process, called or not.

Two consequences, and they are rules rather than preferences:

1. Analysis runs in a **supervised child**: a small worker that imports `openlore`, runs one API
   call for one root, and streams its `onProgress` events back over IPC. The parent's abort
   becomes the worker's `AbortSignal`, a crash is an exit code the supervisor reads, and no
   analyzer code is ever loaded into the server.
2. **No module in the server process may `import 'openlore'`**, statically or dynamically. The
   adapter holds paths and spawns children; the only openlore import allowed in-process is
   `openlore/serve-descriptor`, which upstream guarantees analyzer-free and tests from outside the
   package. A lint or unit test enforces this, because the failure is invisible — everything works,
   and the server has quietly gained a hundred megabytes of parser.

### D3 — Outpost holds the daemon as a handle, and says whether it owns it

The workspace calls `openloreServe({ rootPath, host: '127.0.0.1', token, watch: true,
idleTimeoutMs, ifRunning: 'adopt' })` before its agent session is created, and supervises what
comes back. The returned `ServeHandle` carries `owned: boolean`:

- **`owned: true`** — we started this daemon. The full supervision contract applies: state,
  bounded restart, retained diagnostics, and a `close()` that stops it.
- **`owned: false`** — a compatible daemon was already serving this working tree (a terminal `pi`,
  an editor, a second Outpost). We adopt it: we report the capability from it and from the index
  on disk, and our `close()` **detaches** without stopping a process we did not start.

Adoption is the correct answer rather than a consolation. One warm process per repository is
OpenLore's own design goal; a second daemon on the same tree would be the waste that design exists
to prevent.

The Pi extension is told not to spawn its own (`OPENLORE_PI_NO_SPAWN=1` in the agent process), so
the daemon Outpost holds is the only one, and discovery finds it through the descriptor
`openloreServe` publishes. Without that variable the extension's own spawn is a second,
unsupervised process that would outlive the session and defeat the restart bound.

*Why not inject the endpoint into the extension.* Because the descriptor already carries it, and a
second way into the daemon would be a second trust path — one that bypasses the validated
descriptor. Upstream rejected it for that reason and they are right.

*Why not read the descriptor ourselves.* We do not need to: `openloreServe` returns the handle,
and `openloreHealth` answers without one. The one published subpath exists for hosts that must
discover a daemon they did not start; ours is handed to us.

### D4 — One writer per working tree, and OpenLore is the one who says so

The daemon's `--watch` lane and Outpost's analysis worker are both writers of the same index.
Rather than choose between them by convention, the design leans on the lock OpenLore already has:
`openloreAnalysisStatus` reports whether an analysis is in progress, its owner and its heartbeat
age, without provoking an error; `openloreAnalyze` throws `AnalysisInProgressError` carrying the
same facts if one starts anyway. So a reconciliation asks first, and does not race: if another
process owns this root, report `reconciling`, watch, and let it finish. A stale lock is reported
as no analysis in progress, which is exactly the distinction a supervisor needs.

The daemon keeps `--watch` — it is what makes an ordinary edit converge without Outpost doing
anything — and Outpost's worker drives only the transitions the watcher cannot express as a state:
the first index and a snapshot change.

### D5 — Identity is the working tree, and it is already the workspace's identity

The supervisor map is keyed by `Workspace.root` (a resolved real path); the daemon is started at
that root; every API call passes `rootPath` explicitly and never defaults to `process.cwd()`.
Repository identity is never a key. Two worktrees of one repository are two entries, two daemons
and two indexes, with no special case written for them — and no code path could federate them to
each other, because Outpost never writes `federation.json`.

### D6 — A snapshot transition is a git-dir event, and freshness is a question before it is a job

The tree watcher cannot see a branch switch as anything but a burst of file changes, and the
daemon's debounced repair gives Outpost no moment it can call "reconciled". So the workspace
watches its own git directory narrowly — `HEAD` and `packed-refs`, at
`<gitdir>/worktrees/<name>/HEAD` for a linked worktree — and on a change to the resolved HEAD:

1. mark the capability `reconciling`;
2. ask `openloreIndexState({ rootPath })`. A `matchesWorkingTree: true` ends it — the checkout
   landed on a tree the index already represents, and nothing needs rebuilding;
3. otherwise run `openloreAnalyze({ rootPath, force: true, onProgress, signal })` in the worker,
   leaving `reExtract` false so the per-file extraction cache is reused — OpenLore's own note says
   `force` alone is "what a rebuilding daemon or a healing watcher wants — re-analysis without
   re-parsing";
4. return to `ready` on a result that is not degraded.

Rapid transitions (a rebase, a bisect) are debounced into one reconciliation, and a transition
arriving mid-analysis aborts the running one through its signal and starts the current tree's.

Two costs to hold honestly. `openloreIndexState` is O(repository bytes) of I/O — cheap next to
analysis, not free, so it is called per checkout and never per keystroke. And an index built before
openlore persisted its fingerprint configuration answers `config-unrecorded`, which is a
`matchesWorkingTree: false`: the first contact with an older index costs one full analysis, after
which comparisons are meaningful. Sound direction only — the function never claims a match it
cannot prove.

*Alternative rejected: rely on `serve --watch` alone.* It does converge, but nothing in the
protocol says when, so `ready` would mean "a daemon is up" — precisely what
`ReadinessIsProvedFunctionally` forbids.

### D7 — Readiness comes from disk; the daemon refines it

`openloreHealth({ rootPath })` is the answer, and its shape is the state:

- `runtime` and `index` (with `indexDegradations`) come from disk. **A repository with a whole
  index and no daemon is `ready`** — the daemon serves the agent's queries, it does not constitute
  the capability;
- `repairInProgress` reflects live analysis ownership;
- `watcher` is `'unknown'` unless a daemon is discoverable and healthy, in which case `/health`
  reports it. A stopped watcher means a silently ageing index, so it is worth knowing.

Outpost stores no opinion of its own about the index and runs no integrity check: readiness is a
question asked of OpenLore, not an inspection. The one thing the supervisor adds is its own child
handle — a process that died is not `ready` whatever disk says, and that is the only proposition
Outpost owns.

Analysis needs no LLM provider — that is `openloreGenerate`'s concern — so the capability must
never be gated on OpenLore's generation configuration. A project with no `.openlore/config.json`
at all yields `no-config`, and in `auto` that is *unavailable with a reason*, not a failure.

### D8 — One state machine, bounded restarts, retained evidence

`disabled → starting → indexing | reconciling → ready`, with `degraded` reachable from `ready`,
and `failed` terminal until an explicit retry. A crash of a daemon we own moves to `recovering` and
restarts with exponential backoff, capped at a small number of attempts inside a window; past the
cap the state rests at `failed` with its reason. `isOpenLoreError` gives that reason a typed code
rather than a stringified stack. The last error and a bounded tail of each child's output are
retained per workspace and served only on request, to the connection bound to that workspace.

Restarting is per entry. Nothing in the supervisor reaches another workspace's entry, and
`process.exit` is never a consequence of an analysis failure.

### D9 — Closing a workspace closes the handle, and `owned` decides what that means

Closing or retiring a workspace cancels any running worker through its `AbortSignal` and calls
`handle.close()`. On an owned handle that stops the daemon; on an adopted one it detaches and
resolves without touching a process another consumer is using. The spec's "release or suspend" is
satisfied by the same call in both cases, and the daemon's own idle timeout is the backstop for a
handle that leaks — which is why `idleTimeoutMs` is set rather than disabled.

### D10 — The extension and its skills are resolved once, and both runtimes are handed them

One resolver answers "where is OpenLore" — the configured path, the payload the standalone
unpacked, the installed dependency — and yields what each consumer needs: the module specifier for
the worker, the Pi extension path, and the skills directory the package declares (`pi.skills`).

The embedded runtime appends the extension to `additionalExtensionPaths` and the skills to
`additionalSkillPaths`; the RPC runtime appends `--extension <path>` and `--skill <path>` beside
the resources it already passes. Nothing else differs between them.

The skills matter for the same reason generation is not Outpost's lane (D1): they are how the agent
does spec generation, repair and verification when the user asks. Withholding them would leave the
agent the tools and not the method. They follow the server's existing skill policy — a user's own
paths win a name collision, and `noSkills` withholds ours as it withholds every other bundled skill.

### D11 — The capability signal is one line of context, not a tool wrapper

When a workspace's capability is not `ready`, Outpost appends its state and reason to the turn's
context through the mechanism it already has for web-UI context. The tools are left exactly as
OpenLore registered them — wrapping them to intercept calls would be the reimplementation this
change exists to avoid — and a call made anyway returns the daemon's own typed error. When the
state returns to `ready` the line stops being added and the same session uses the tools again;
nothing is rebuilt. OpenLore's own `before_agent_start` injection is not duplicated.

### D12 — The standalone carries a payload it unpacks, search included, and re-enters itself to run it

OpenLore cannot be bundled into the SEA blob: it loads tree-sitter `.wasm` grammars and other
assets from disk at runtime, and absorbing it would make an independently versioned dependency part
of this source tree. So the build attaches OpenLore's published package — `dist`, `skills`,
`schemas`, `stubs` and the production dependencies it needs — as a compressed payload inside the
executable, unpacked on first use into a per-version directory the executable owns and reused
afterwards.

**What the payload carries, and what it deliberately does not.** Measured, after openlore moves its
viewer and MCP SDK to optional dependencies:

| | raw | compressed |
|---|---|---|
| openlore `dist` + skills/schemas/stubs, and its needed hard dependencies | 81 MB | 11 MB |
| `@lancedb/lancedb` + `apache-arrow` and their small dependencies | 18 MB | ~4 MB |
| `@lancedb/lancedb-<platform>` — one native `.node` | 231 MB | 85 MB |
| **total** | **~330 MB** | **~100 MB** |

LanceDB is carried because without it there is no search: it stores the `function`, `text` and
`spec` indexes alike, and its absence is reported for all three. A standalone that answered
`orient` but not `search_code` would be a different product.

Deliberately omitted, each with a stated cost:

- **`@huggingface/transformers` and onnxruntime** (212 MB) — local embedding computation. A project
  configured for a remote embedder is unaffected; one configured for local embeddings gets a named
  `indexDegradations` entry saying which package is missing, which is actionable rather than
  mysterious. Note it must be excluded explicitly: LanceDB declares it among *its own* optional
  dependencies, so an unqualified install drags it back in.
- **The seventeen native tree-sitter grammars** — AST-aligned chunking for embedding. The call
  graph does not use them; chunking falls back to blank lines. This one degrades *silently*, which
  is a diagnostic gap worth raising upstream.

**The payload is platform-specific**, because the LanceDB binary is. That fits the release, which
already publishes one executable per platform: each build installs the matching
`@lancedb/lancedb-<platform>` (`npm install --os=… --cpu=… --libc=…` from one machine, or the
tarball directly — it is a single file).

**Both children re-enter the executable**: `process.execPath` with an internal argument that makes
the SEA main hand off either to the unpacked OpenLore CLI or to the worker that imports the unpacked
API module. That reuses the runtime already distributed and keeps a real process boundary.

Under a normal npm install there is no payload — see D13.

*Alternative rejected: require an installed `openlore` and a Node runtime.* Fails the distribution
requirement outright.
*Alternative rejected: bundle OpenLore into the esbuild bundle.* Its asset loading and dynamic
requires make it fragile, and pinning it inside the bundle erases the version boundary the proposal
insists on.

### D13 — On npm, OpenLore is an optional peer, not a dependency

pi-outpost declares openlore as an **optional peer dependency** at an exact version, not a
dependency:

```jsonc
"peerDependencies":     { "openlore": "<exact>" },
"peerDependenciesMeta": { "openlore": { "optional": true } }
```

**Why.** npm installs a dependency's `optionalDependencies` by default, and openlore's are where
the weight lives: installing it as a dependency took this repository's `node_modules` from 655 MB
to 1.7 GB. Those packages are optional *by openlore's design* — lazily imported, absent means a
named degradation. Making openlore a hard dependency would defeat that design on every pi-outpost
user's behalf, for a capability the specs describe as offered where it can be served.

So: the standalone carries the capability and it is automatic there; on an npm install it is
opt-in, and `auto` reports it unavailable with a reason until the user installs openlore. The exact
version documents what the integration was built against, and the resolver (D10) is the single seam
a new version enters through.

### D14 — Where the API stops, the daemon answers — and nothing else

With `extend-api-for-supervising-hosts`, the API covers Outpost's whole lane. What remains outside
it is the agent's tool dispatch, which belongs to the extension. The rules stay:

1. **the API** for everything Outpost asks;
2. **`openlore/serve-descriptor`** — the one published subpath that does not load the analyzer —
   if a discovery need ever arises. Today `openloreServe` removes it;
3. **the daemon's HTTP surface** is the *extension's*, not ours. Outpost does not call
   `POST /tool/:name`;
4. deep-importing `openlore/dist/**` is forbidden. It is blocked by the exports map, and reaching
   past a package's published surface is forking by import.

**Not asked for, deliberately: exporting `dispatchTool` for a daemon-free path.** It exists and is
pure, and it should stay unexported. The Pi extension has no in-process path — it throws
`PiDaemonConnectionError`; the graceful fallback belongs to the stdio MCP server. In-process
dispatch would mean *our* process (D2). And one warm cache and one watcher per repository is the
property the daemon exists to produce. Upstream agrees and has said so in their non-goals.

**Upstream follow-ups this change surfaced**, neither blocking:

- the AST chunker's fallback is silent — a missing native grammar produces no `indexDegradations`
  entry, unlike LanceDB's, so a quietly worse index is indistinguishable from a good one;
- `@lancedb/lancedb` pulling `@huggingface/transformers` through its own optional dependencies
  means "I want the vector store" and "I want a local embedding runtime" cannot be chosen
  separately without `--omit=optional` plus a manual platform package.

## Risks / Trade-offs

- **A dependency's import loads a hundred megabytes of parser into the wrong process** → D2 makes
  it a rule and a test, because the symptom is invisible: everything works, only heavier.
- **The extension self-spawns behind the supervisor's back** → `OPENLORE_PI_NO_SPAWN=1`, plus
  Outpost starting its daemon before the agent session exists. A test must prove no second daemon
  appears for a tree we serve.
- **An adopted handle's `close()` does not stop a daemon** → that is its contract, and `owned: false`
  says so. The risk is a host that ignores the flag; ours reads it, and a test asserts an adopted
  daemon survives the workspace closing.
- **Two writers on one tree** → resolved by OpenLore's ownership lock and `openloreAnalysisStatus`
  (D4). A stale lock is distinguishable through `heartbeatAgeMs`, and the state is `reconciling`
  rather than `failed` while an owner is live.
- **The payload is ~100 MB compressed and platform-specific** → accepted deliberately (D12): the
  alternative is a standalone that cannot answer `search_code`. The build must fail loudly if the
  platform binary for the target is missing, rather than shipping an executable whose search is
  broken at runtime.
- **N workspaces × one analysing child is real CPU** → cap concurrent first-index work, let
  `idleTimeoutMs` retire daemons of workspaces nobody is watching, and never index a workspace that
  has not been opened.
- **A read-only or write-forbidden project cannot hold an index** — `.openlore/` is written inside
  the tree → the capability reports itself unavailable with that reason, which
  `OfferedWhereItCanServe` already requires.
- **Node floor**: OpenLore needs Node ≥ 22.19. The standalone carries its own; an npm install on an
  older runtime must report the capability unavailable, not crash the server.
- **A branch-switch storm** (rebase, bisect) → debounce HEAD transitions, abort the superseded
  analysis through its signal, and report `reconciling` throughout rather than flapping to `ready`.
- **`config-unrecorded` on first contact** → one full analysis against an index built before
  openlore persisted its fingerprint configuration. Expected, bounded, and reported as
  `reconciling` rather than as a fault.
- **Federation reads peer index directories outside the workspace root** → that is OpenLore reading
  an index the user registered, not an agent tool call. The agent's own reach is unchanged, which
  is what the architecture delta states and what a test must prove.

## Migration Plan

**This change depends on an openlore release carrying `extend-api-for-supervising-hosts`.** Pin
that version exactly (D13); the resolver (D10) is the single seam it enters through.

**Implementation order.** Groups 1–8 and 10 first, group 9 (Distribution) last: the payload is the
most platform-dependent work and the least coupled to the rest. Three task groups need nothing from
OpenLore at all and can be built before its release lands — the state machine (a pure function),
the configuration block, and the protocol and broadcast surface.

Additive throughout for consumers. New protocol fields are optional, so an older client ignores
them; the default mode is `auto`, so a project OpenLore cannot serve behaves exactly as it does
today. Rollback is `codeIntelligence.mode: off`, which starts nothing — the same state as before
this change. The standalone payload is inert until a workspace opens with the capability enabled.

## Open Questions

None of these change the specs, the approach, or the task breakdown.

1. Whether the supervised daemon should run one child or two: `openloreServe` can be hosted inside
   the same child that runs the analysis (fewer processes, wider blast radius) or in its own
   (narrower, one more process). Both satisfy the spec; cheap to reverse.
2. Which serve preset to run. The extension asks for `full`; a narrower preset is a smaller tool
   surface for weaker models. Default to what the extension expects and revisit.
3. Whether the standalone should ever ship a "lite" artifact without the LanceDB binary — a
   ~15 MB executable that answers the graph but not search. Only worth doing if the ~100 MB payload
   proves to be a real obstacle for someone.
