> **Depends on an openlore release carrying `extend-api-for-supervising-hosts`.** Groups 2–6 and 9
> use the surface it publishes. Three pieces need nothing from it and can be built first: 3.1 (the
> state machine, a pure function), group 8 (configuration) and 7.1–7.4 (protocol and broadcast).
> Build group 9 (Distribution) last — it is the most platform-dependent and the least coupled.

## 1. The adapter: one boundary over OpenLore's two surfaces

- [ ] 1.1 Declare `openlore` as an **optional peer dependency** at an exact version — not a dependency, because npm installs a dependency's optional dependencies by default and openlore's carry ~1 GB. Verify with a test that a plain `npm install` of this repository does not pull openlore, and that the exact version is recorded (D13).
- [ ] 1.2 Create the adapter module that owns every OpenLore-specific detail — the resolved paths, the serve handle, the health and freshness calls, the worker protocol. Verify with a unit test asserting no other server module reaches OpenLore (D1, `LayeredArchitecture` delta).
- [ ] 1.3 Implement runtime resolution — configured path, unpacked standalone payload, installed dependency, in that order — yielding the module specifier for the worker, the Pi extension path and the declared skills directory. Verify each branch with a unit test over a fake filesystem, including "none found" returning a reason rather than throwing (D10).
- [ ] 1.4 Enforce that no module loaded in the server process imports `openlore`, statically or dynamically — only `openlore/serve-descriptor` is permitted, and only if a discovery need arises. Verify with a test over the server's module graph that the analyzer is never loaded in-process (D2).

## 2. The analysis worker over the programmatic API

- [ ] 2.1 Write the child worker that imports `openlore` and runs one API call for one `rootPath`, never defaulting to `process.cwd()`. Verify with a test that it analyses the root it was given and no other (D2, D5).
- [ ] 2.2 Stream `onProgress` events (`phase`, `step`, `status`, `detail`) from the worker to the parent over IPC, and map the parent's cancellation onto the call's `AbortSignal`. Verify with a test that progress arrives in order and that cancelling ends the call rather than orphaning it (D2).
- [ ] 2.3 Translate the analyze result into capability state: `degraded` / `indexDegradations` become `degraded` with OpenLore's own reason, a clean result becomes `ready`, and `fromCache` is not mistaken for a fresh index. Verify with unit tests over each result shape, including the three-entry `indexDegradations` a missing vector store produces (D7, `ReadinessIsProvedFunctionally`).
- [ ] 2.4 Ask `openloreAnalysisStatus` before starting an analysis, and handle `AnalysisInProgressError` if one starts anyway: report `reconciling` rather than racing or failing, using `owner` and `heartbeatAgeMs` to tell a live owner from an abandoned one. Verify with a test that a second analysis on one root does not start a competing write (D4).
- [ ] 2.5 Surface typed OpenLore errors (`isOpenLoreError`, `ErrorCode`) as the readable reason on `degraded`, `failed` and `unavailable` — `no-config` included. Verify with a test that a reason is a code and a message, never a stringified stack.
- [ ] 2.6 Verify that no analyzer code is loaded into the server process: a test asserting the work happens in a child and that the server never loads OpenLore's analyzer modules (D2).

## 3. The per-workspace supervisor

- [ ] 3.1 Implement the state machine — `disabled`, `starting`, `indexing`, `reconciling`, `ready`, `degraded`, `failed`, `recovering` — as a pure transition function. Verify with unit tests covering every named state in `SupervisedPerWorkspaceWithABoundedRestart` (D8). *No OpenLore dependency; build this first.*
- [ ] 3.2 Start the daemon through `openloreServe({ rootPath, host: '127.0.0.1', token, watch: true, idleTimeoutMs, ifRunning: 'adopt' })` per workspace and hold the handle. Verify with an integration test that the daemon comes up, publishes its descriptor for the extension, and that the handle reports `owned: true` (D3).
- [ ] 3.3 Honour `owned: false` on an adopted daemon: report the capability from it and from the index on disk, and never restart or stop it. Verify with a test that a tree already served by another process yields an adopted handle, that the capability still reaches `ready`, and that it is not reported failed (D3, `AnotherProcessAlreadyServesThisTree`).
- [ ] 3.4 Derive readiness from `openloreHealth` plus the supervisor's own child handle: disk is authoritative, a discoverable daemon refines `watcher`, and a repository with a whole index and no daemon is `ready`. Verify with tests that an unbuilt index reports `indexing`/`degraded` and never `ready`, and that a healthy index with no daemon is `ready` (D7).
- [ ] 3.5 Implement bounded restart with exponential backoff and a capped attempt count inside a window, resting at `failed` afterwards — for owned daemons only. Verify with a test using an always-failing launch that the number of starts is bounded and the final state carries a reason (D8).
- [ ] 3.6 Retain the last error and a bounded tail of each child's output per workspace, exposed only on request. Verify with a test that a crashed instance can be explained afterwards and that the tail is length-bounded.
- [ ] 3.7 Verify with an integration test over three supervised instances that killing one leaves the server running, leaves the other two `ready`, and moves only the affected one through `recovering`.

## 4. Workspace ownership and lifecycle

- [ ] 4.1 Give `Workspace` its code-intelligence entry, keyed by the workspace's resolved root, created when the workspace is built. Verify with a test that two workspaces on two git worktrees of one repository hold two distinct entries with two distinct roots (D5, `IsolateWorkspacesFromEachOther` delta).
- [ ] 4.2 Release the entry on close, removal and idle retirement: abort any running worker through its signal, then `handle.close()` — which stops an owned daemon and detaches from an adopted one. Verify with tests that closing one workspace leaves the others' instances running, and that an adopted daemon survives its workspace closing (D9, `RetireIdleWorkspaces` delta).
- [ ] 4.3 Start or resume the capability when a retired workspace is rebuilt. Verify with a test that reopening a retired workspace restores its capability without disturbing any other.
- [ ] 4.4 Verify with a test that switching the visible workspace neither stops nor pauses another workspace's indexing, and that the indexing completes.

## 5. Snapshot transitions

- [ ] 5.1 Watch the workspace's git directory for HEAD and `packed-refs` changes, resolving the linked-worktree case. Verify with a test over a repository with a linked worktree that a checkout in either tree is observed by that tree's workspace only (D6).
- [ ] 5.2 On a resolved-HEAD change, move to `reconciling` and ask `openloreIndexState` first; a match ends the reconciliation with no analysis. Verify with a test that switching to a branch the index already represents does not run an analysis (D6).
- [ ] 5.3 On a mismatch — `fingerprint-mismatch`, `no-index`, `unbaselined` or `config-unrecorded` — run `openloreAnalyze({ rootPath, force: true, onProgress, signal })` in the worker, leaving `reExtract` false, and return to `ready` only on a result that is not degraded. Verify with an integration test that switches branches and asserts the state sequence (`ASnapshotTransitionIsReconciledBeforeReady`).
- [ ] 5.4 Debounce rapid transitions into one reconciliation and abort a superseded one through its signal. Verify with a test simulating a rebase that a single reconciliation survives and the state never flaps to `ready` in between.
- [ ] 5.5 Verify with a test that an ordinary file edit does not trigger a snapshot reconciliation, and that incremental freshness is left to the daemon's watcher.

## 6. Reaching the agent

- [ ] 6.1 Hand the resolved extension path to the embedded runtime through `additionalExtensionPaths`, and set `OPENLORE_PI_NO_SPAWN=1` for the agent so the extension uses the supervised daemon rather than starting its own. Verify with a test that the OpenLore tools are present, that no MCP server is configured or running, and that no second daemon appears for that tree (`StructuralToolsReachTheAgentNatively`, D3).
- [ ] 6.2 Hand the same path to the RPC runtime as an `--extension` argument beside the existing tools extension, with the same environment. Verify with a test that the same tools are present under that runtime, answering about the same working tree.
- [ ] 6.3 Pass the declared skills to both runtimes — `additionalSkillPaths` for the embedded one, `--skill <path>` for the RPC one — under the existing skill policy. Verify with tests that the skills are listed, that a user skill of the same name wins, and that `noSkills` withholds them (D10, `TheSkillsTravelWithTheTools`).
- [ ] 6.4 Verify with a test that the server calls no generation, verification, drift or audit function and writes nothing into the project: open, index, reconcile and close a workspace, then assert no model provider was called and no document was written (`TheServerIndexesAndNothingMore`).
- [ ] 6.5 Append the capability state and reason to the turn's context when the state is not `ready`, and stop appending when it returns to `ready`, without duplicating OpenLore's own `before_agent_start` injection. Verify with a test that a turn taken while the capability is down carries the signal, and that the same session uses the tools again after recovery with no rebuild (D11, `TheAgentIsToldWhatItCanUse`).
- [ ] 6.6 Verify with a live check — one short run against a real model on a project with a ready capability — that the agent actually calls a structural tool and receives a result, per the project's "test it in the running app" rule.

## 7. Protocol and interface

- [ ] 7.1 Add the per-project code-intelligence state to the snapshot and to the workspace-state broadcast in `shared/src/protocol.ts`, with optional progress and a reason. Verify with a test that an older client shape still parses and that the fields are optional (`CodeIntelligenceStateOnTheWire`). *No OpenLore dependency.*
- [ ] 7.2 Carry OpenLore's `onProgress` steps through to the client as the progress the interface shows, and send none where OpenLore reports none. Verify with a test over both cases (D2).
- [ ] 7.3 Broadcast state changes to every connection regardless of binding, carrying no project content. Verify with a test that a client bound to A receives B's state transitions and none of B's results or conversation.
- [ ] 7.4 Add the diagnostics request, scoped to the bound workspace, and verify with a test that a request for another workspace's diagnostics is refused.
- [ ] 7.5 Surface each project's state in the workspace control, with determinate progress only where OpenLore supplied it. Verify in the running widget with `npm run bench` and Playwright — read the DOM for the three states — after rebuilding `web`, `@pi-outpost/embed` and the e2e host.
- [ ] 7.6 Raise a code-intelligence failure needing attention through the existing multi-workspace attention model, with no dialog or focus change over the viewed workspace. Verify in the running app that the selector badges the background project and the current one is untouched.
- [ ] 7.7 Put the detailed diagnostics behind an on-demand affordance and verify in the running app that the primary interface carries no permanent runtime detail for a ready workspace.

## 8. Configuration

*No OpenLore dependency; buildable before its release lands.*

- [ ] 8.1 Add the `codeIntelligence` block — `mode` of `auto`/`on`/`off`, optional runtime path — to config loading and the example config. Verify with tests that an absent block means `auto`, that `off` starts nothing, and that an unknown mode fails startup with an error naming `codeIntelligence.mode` (`CodeIntelligenceSetting`).
- [ ] 8.2 Verify with a test that a configured runtime path that does not exist leaves the server starting and the workspace working, with the capability unavailable and the path named.
- [ ] 8.3 Verify with a test that a project that cannot be served — a read-only tree that cannot hold an index, or one with no `.openlore/config.json` that yields `no-config` — opens normally and reports the capability unavailable with that reason, and that the capability is never gated on OpenLore's LLM generation settings (`OfferedWhereItCanServe`, D7).
- [ ] 8.4 Verify with a test that an npm installation without openlore present reports the capability unavailable with an actionable reason, and that the server and every workspace are otherwise unaffected (D13).

## 9. Distribution

*Build last. The payload is platform-specific and the least coupled to the rest.*

- [ ] 9.1 Attach OpenLore's published package at the pinned version to the standalone build as a compressed payload — `dist`, `skills`, `schemas`, `stubs` and its needed hard dependencies, excluding the viewer and the MCP SDK. Verify the executable's size delta is measured and recorded, and that the build fails loudly if the payload is missing (D12).
- [ ] 9.2 Add `@lancedb/lancedb`, `apache-arrow` and their small dependencies to the payload, **excluding LanceDB's own optional dependencies** so the local embedding runtime is not dragged in. Verify with a test that the payload contains no `onnxruntime` and no `@huggingface` (D12).
- [ ] 9.3 Install the matching `@lancedb/lancedb-<platform>` native binary for each release target from one build machine. Verify the build fails loudly when the target's binary is absent, rather than producing an executable whose search breaks at runtime (D12).
- [ ] 9.4 Unpack the payload once per version into a directory the executable owns, reusing it on later runs. Verify with a test that a second run does not unpack again and that a corrupted unpack directory is re-created rather than used.
- [ ] 9.5 Add the internal re-entry argument that makes the executable run either the unpacked OpenLore CLI (the daemon) or the API worker, with the runtime it already carries. Verify by running the built executable on a machine image with no Node installed: open a project, reach `ready`, and get a result from a search tool (D12).
- [ ] 9.6 Ensure the Pi extension loads under SEA — the SDK's jiti loader and its virtual modules must satisfy the extension's imports. Verify by listing the agent's tools from the built executable and finding the structural ones (`CodeIntelligenceOnAMachineWithNothingInstalled`).
- [ ] 9.7 Report the carried OpenLore version distinctly from pi-outpost's own version, and verify it is visible where the executable says what it carries.
- [ ] 9.8 Update `docs/sea-packaging.md` and the README for what the executable now carries — search included, local embedding computation and the native grammars not — still without any MCP step.

## 10. Federation and isolation

- [ ] 10.1 Verify with a test that Outpost never writes `federation.json` and never registers a peer, and that two worktrees of one repository are not made peers of each other (`FederationIsStructuralKnowledgeNotAccess`).
- [ ] 10.2 Verify with a test that a federated answer reaches the agent intact, coverage block included, with peers mapped by repository identity.
- [ ] 10.3 Verify with a test that a federated peer that is also an open workspace confers no read, write, execution or session access: each such tool call is refused exactly as it would be without federation (`SecurityModel` delta).
- [ ] 10.4 Verify with a test that the daemon endpoint is loopback-only, token-protected, and not proxied by any pi-outpost route.

## 11. Proving the change

- [ ] 11.1 Produce the scenario-to-test matrix required by the project: enumerate every `#### Scenario:` in this change's delta specs with `rg '^#### Scenario:' openspec/changes/integrate-openlore-per-workspace/`, classify each as covered/partial/uncovered with its test file and name, and record it in `scenario-coverage.md`.
- [ ] 11.2 Run the focused tests, then the server and web suites, and record the results; no scenario may remain partial or uncovered.
- [ ] 11.3 Run `openspec validate integrate-openlore-per-workspace --strict` and verify it passes.
- [ ] 11.4 Run the standing post-task code review on the working-tree diff and address the blocking findings.
