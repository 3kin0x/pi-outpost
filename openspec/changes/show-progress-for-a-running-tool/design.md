## Context

See `proposal.md` — Why. Three facts about the current code shape the approach.

- The pi SDK already hands every tool an update callback:
  `execute(toolCallId, params, signal, onUpdate, ctx)`
  (`core/extensions/types.d.ts`). `onUpdate` takes a partial `AgentToolResult<TDetails>`,
  and the `tool_execution_update` event that results carries `partialResult` typed
  `any`. `AgentToolResult` is generic on `TDetails` — `details` is the SDK's own slot
  for tool-defined payload, and it already survives to the client on `tool_end`.
- pi-outpost already turns `tool_execution_update` into a live `tool_update`
  broadcast: `rpcRuntime.ts` / `embeddedRuntime.ts` read `partialResult.content`,
  `server/src/index.ts` flattens it to text and `broadcast`s
  `{ type: "tool_update", toolCallId, text }`, and `useAgent.ts` merges that onto the
  tool chat-item as `output`. Everything that is not a text block is dropped at
  `contentText()`.
- `tool_update` is never written to session history. `convert.ts` rebuilds tool
  cards from history without it, marking a trailing tool "running" only from the
  stream state.

The only gap is a typed number travelling that existing path and a bar drawn from it.

## Goals / Non-Goals

**Goals:**

- One number, `0..1`, from the tool to every client, on the stream that already
  exists, with no change to the pi SDK.
- The client shows it only while it is true — during the run, after it is known —
  and never has to reason about a stale value.
- A tool that does not report progress, and code that renders its card, are
  untouched.

**Non-Goals:**

- A label, an ETA, step counts, or any second progress signal. The card already
  streams detail.
- Persisting progress or replaying it after a reconnect.
- Making progress authoritative or monotonic. It is a hint the tool volunteers.
- Rendering progress for anything other than a tool call (assistant turns,
  compaction, uploads are their own concerns).

## Decisions

### Carry the fraction on `partialResult.details.progress`, not a new SDK surface

`onUpdate` and `details` already exist and already flow. A tool reports progress by
calling `onUpdate({ content, isPartial: true, details: { progress } })` — the same
call it makes to stream text.

- *Alternative: a first-class `onProgress` / `ctx.reportProgress` in the SDK.*
  Out of this repo's control, slower to land, and unnecessary — `details` is the
  slot the SDK provides for exactly this.
- *Alternative: parse a `progress: NN%` token out of the streamed text.* Rejected
  in exploration: an implicit text contract, broken by truncation, and not
  first-class.

The runtimes read it defensively — `partialResult?.details?.progress` — so a
runtime dialect that does not carry `details` on updates simply yields no bar.
The RPC record and the SDK event differ *around* the partial result but not in
this extraction, so both runtimes call one shared `toolUpdateEvent(toolCallId,
partial)` helper in `agentRuntime.ts` rather than each open-coding the reach —
one place to read defensively, one place a test pins.

### A typed `progress?: number` on `tool_update`, not a new message

`tool_update` already fires on the exact SDK event, at the exact cadence, for the
exact tool call. Adding an optional field is one edit per hop
(`agentRuntime.ts` event type → `protocol.ts` wire type → `useAgent.ts` merge).

- *Alternative: a parallel `tool_progress` message.* Doubles the plumbing and adds
  an ordering question (progress vs. text for the same call) for no gain.
- *Alternative: overload `text`.* That is the text-token approach under another name.

### Clamp and validate once, at the server broadcast boundary

`server/src/index.ts`'s `tool_update` case is the single point every client and the
embedded widget pass through. It coerces `progress` to a finite number, clamps to
`[0, 1]`, and omits the field entirely when the value is not a finite number. The
runtimes pass `details?.progress` up untouched; the UI trusts what it receives.

- *Alternative: validate in the UI.* Two clients, one contract — the wire should
  never carry an out-of-range or `NaN` progress.
- A decreasing value is *valid* and passes through unchanged; only the shape is
  enforced here, not the trajectory.

### The bar is card chrome, drawn from item state, cleared by `running`

`useAgent.ts` already flips `running: false` on `tool_end`. `ToolCard` gates the
bar on `item.running && item.progress != null`, so:

- No bar before the first fraction (`progress` starts `undefined`).
- `tool_update` merges `progress` onto the item **only when the message carries
  one**, so a later text-only update leaves the last value in place.
- `tool_end` needs no progress bookkeeping — `running` goes false and the gate
  closes. The last `progress` value may stay on the item unused.

The bar sits in the card container, above the presentation slot, independent of
which presentation (built-in, extension, structured-exchange) renders the output.
Because `ToolCard` is shared, `@pi-outpost/embed` gets the bar with no embed-side
change.

### Render with the native `<progress>` element

`<progress value={f} max={1}>` — `f` is already `0..1`, so no conversion, and the
element carries `role="progressbar"` / `aria-valuenow` semantics for free.

- *Alternative: a styled `<div>` bar like `WorkPlanPanel`'s inline one.* More code,
  manual a11y. `<progress>` can be themed later (accent colour, height) without
  touching the contract.

## Risks / Trade-offs

- **The SDK's `partialResult` shape is `any` and could drift, or the OMP RPC
  dialect may not include `details` on updates.** → Read every hop defensively
  (`?.`); the failure mode is "no bar", which is today's behaviour. A test covers
  an update with no `details`.
- **A tool that calls `onUpdate` with a new fraction every few milliseconds
  causes re-render churn.** → The payload is one number and one `<progress>`
  attribute; React reconciliation is cheap here. If it ever matters, a minimum
  broadcast interval can be added at the server boundary without a contract change.
- **`text` is truncated at the server; a reader might assume `progress` is too.** →
  It is a number, unaffected by `truncate()`. Stated here so no one adds a guard
  that is not needed.
- **An embed consumer that tightly styles tool cards sees a new element appear.** →
  It appears only for tools that opt in by reporting, and only inside the existing
  card container. Documented in the extension authoring note.
- **A client that reconnects mid-run shows no bar for up to one update interval.**
  → Accepted by the spec ("only while running, only after a fraction has
  arrived"); persisting a value that is stale the moment it is written would cost
  a history-schema field for no real gain.

## Open Questions

- Whether to theme `<progress>` to match the product accent now or leave it
  browser-default. Cosmetic; no contract or task impact.
- Whether a minimum broadcast interval for progress is worth adding pre-emptively.
  Deferrable — it is a server-local tweak with no spec or client impact.
