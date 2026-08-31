## Why

pi-outpost's agent works a project by reading it file by file. OpenLore already answers the
structural questions that reading cannot — who calls this, what breaks if I change it, which
tests cover it, what did we decide last time — but today it reaches an agent only through an
MCP server the user installs, configures and runs themselves. A standalone pi-outpost, whose
whole point is a machine with nothing installed, cannot offer it at all.

The obstacle is not the analysis; it is ownership. One MCP server is a process-wide thing,
and pi-outpost is not: it holds several projects at once, each with its own session, sandbox,
watcher and history, and a second project must not inherit the first one's index. Two
worktrees of the same repository on different branches are two different source trees, and an
answer computed from one of them is wrong in the other — quietly wrong, which is worse.
Structural analysis therefore has to be owned by the workspace, exactly like everything else
a workspace owns, or it cannot be trusted at all.

## What Changes

- **A per-workspace code-intelligence capability.** Each workspace owns an OpenLore runtime
  bound to its own working tree, started when the workspace is built and released when it is
  closed or retired. No index, no cache and no mutable runtime state is shared between two
  workspaces, including two worktrees of one repository.
- **Native Pi tools, no MCP.** OpenLore is loaded as what it already is — a Pi package whose
  `pi.extensions` entry registers native tools — through the same extension surface both
  agent runtimes already have. Nothing about MCP is required, configured or documented.
- **Outpost supervises the OpenLore runtime.** The analysis runs behind a process boundary,
  per workspace, with a supervised state (starting, indexing, reconciling, ready, degraded,
  unavailable, restarting), bounded restarts, and retained diagnostics. An OpenLore crash
  costs that workspace its structural tools and nothing else.
- **Health is functional, not "is the process alive".** Readiness is proved by the runtime's
  own health and index-freshness answers; a live process with a stale or broken index is
  reported as degraded, not ready.
- **Snapshot transitions are reconciled before the index is called ready.** A branch or HEAD
  change in a working tree is treated as the source tree becoming a different tree, not as a
  file edit: the workspace drives a reconcile and reports `reconciling` until it completes.
- **The agent is told the capability's state.** When the tools cannot be trusted the agent is
  told so once, rather than discovering it by calling them and reading errors; when they come
  back it may use them again without a new session.
- **The interface says where each workspace stands.** The state of a workspace's code
  intelligence is visible per workspace, with determinate progress where the runtime supplies
  it, and a failure needing attention joins the existing multi-workspace attention model.
  Diagnostics on demand; nothing permanent on the primary screen.
- **Federation is preserved, not reimplemented.** OpenLore's existing registry of peer
  repositories keeps working and stays available to the agent. Outpost maps repository
  identity to peers, never workspace or working-tree identity, and federation grants no
  filesystem, write, execution or session access to any other workspace.
- **The standalone executable carries it.** A downloaded executable offers code intelligence
  on a machine with no Node runtime and no OpenLore installation, with no MCP configuration.
- OpenLore stays an independently versioned dependency. Nothing is forked into this tree.

Not breaking: a project with no OpenLore configuration works exactly as it does today, and
the capability reports itself unavailable rather than making the project's agent worse.

## Capabilities

### New Capabilities
- `code-intelligence`: how a workspace obtains, isolates, supervises and exposes structural
  analysis of its own working tree — enablement, snapshot reconciliation, supervised state
  and functional health, the capability signal the agent receives, federation's boundary, and
  what the interface says about all of it.

### Modified Capabilities
- `multi-project-workspaces`: a workspace's inventory of owned resources gains its
  code-intelligence runtime; retirement and closing release or suspend it.
- `architecture`: the layering gains one adapter boundary over OpenLore's programmatic
  surface, and the security model gains the loopback analysis endpoint and federation's
  read-only scope.
- `config`: a setting that enables, disables and points at the code-intelligence runtime.
- `api`: the snapshot and the workspace-state messages carry each workspace's
  code-intelligence state.
- `standalone-executable`: what the executable carries now includes the code-intelligence
  runtime, and what it still does not is stated.

## Impact

- **Code**: `server/src/workspace.ts` (a new owned resource and its lifecycle),
  `server/src/index.ts` (`buildRuntimeFor` for both runtimes, workspace open/close/retire),
  a new adapter module owning every OpenLore-specific detail, `server/src/config.ts`,
  `shared/src/protocol.ts`, `ui/src/useAgent.ts` and the workspace selector.
- **Dependencies**: `openlore` at an exact version — carried by the standalone distribution, and
  an optional peer on an npm install, where the capability is opt-in rather than 1 GB of transitive
  weight nobody asked for.
- **Distribution**: the standalone build gains an OpenLore payload — search included, which makes
  it platform-specific — and a way to run it with the runtime the executable already carries.
- **Out of scope**: multi-agent orchestration; sharing a sandbox between workspaces; any
  cross-workspace filesystem or execution access; MCP; reimplementing federation or its
  graph; a federation-management UI; a persistent index per branch; automatic federation of
  two worktrees of one repository; making the capability mandatory for projects it cannot
  serve. Work Plan evidence, review summaries and cross-workspace conflict detection remain
  future generic Outpost concepts that this change only leaves room for.
