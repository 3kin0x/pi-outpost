## Context

See `proposal.md` — Why. Three facts shape the approach.

- The SDK already answers the question. `AgentSession.getAvailableThinkingLevels(): ThinkingLevel[]`
  in the embedded runtime; the `get_available_thinking_levels` RPC command
  (`{ levels: ThinkingLevel[] }`) in the RPC runtime. `AgentSession` also clamps on
  `setThinkingLevel` (`_clampThinkingLevel`), which is why a rejected level echoes
  back a different one today.
- pi-outpost passes the client one boolean about the model's reasoning —
  `modelSupportsReasoning` (`ModelChoice.reasoning`). Nothing about *which* levels.
- `ThinkingControl` in `ModelBar.tsx` builds its `<input type="range">` from the
  module constant `THINKING_LEVELS` (`shared/src/protocol.ts`), `min=0`,
  `max=length-1`, `value = THINKING_LEVELS.indexOf(current)`. It is a single
  hardcoded scale for every model.

## Goals / Non-Goals

**Goals:**

- Every stop the slider offers is a level the current model accepts, so a
  selection never snaps back.
- A model whose accepted set has a gap (`low, medium, xhigh`, no `high`) is
  presented as ordered stops, not a range with a dead position in the middle.
- Nothing regresses where the list is unavailable — an OMP RPC child, an older
  one — or where the model accepts everything.

**Non-Goals:**

- Changing `set_thinking` validation or the SDK's clamping. This makes the
  control honest; enforcement stays where it is.
- A per-level explanation or cost hint. Out of scope.
- Persisting the accepted set. It is derived from the model, re-fetched on
  connect and on model change.

## Decisions

### The runtime reports the set; the wire carries it optional

`RuntimeSnapshot` gains `thinkingLevels?: ThinkingLevel[]`. Embedded fills it from
`session.getAvailableThinkingLevels()`. RPC issues `get_available_thinking_levels`
and caches the answer, **probed like `get_commands`**: a dialect that does not
implement it (OMP) leaves the field undefined, and `rpcRuntime` already has this
"try once, fall back" shape for optional commands.

- The `hello` snapshot and the `model_changed` message both gain
  `thinkingLevels?: ThinkingLevel[]`. The set only changes on connect and on a
  model switch, and each already has a message — a dedicated message would be a
  third thing to keep in sync.
- *Alternative: derive the set on the client from `model.reasoning` plus a
  table.* That is the guessing this change removes.

### Optional, and absence means "fall back"

`thinkingLevels` undefined → the client uses the full `THINKING_LEVELS` constant,
exactly today's behaviour. This is the OMP path and the older-child path, and it
is also the safe default if a future runtime forgets to fill it.

### The list is normalised before it reaches the control

The server intersects whatever the runtime returned with `THINKING_LEVELS`
(a bundled model map can name a level this build does not know, e.g. `max`), keeps
the canonical order, and ensures `off` is the first entry — thinking can always be
turned off, whatever the model's effort tiers are. The client trusts what it
receives and does not re-filter.

### `ThinkingControl` ranges over the supplied list, not the constant

`levels = props.thinkingLevels ?? THINKING_LEVELS`. The slider is then
`min=0`, `max=levels.length-1`, `value = Math.max(0, levels.indexOf(current))`,
`onChange → levels[i]`, end labels `levels[0]` / `levels.at(-1)`. A gap collapses
to adjacent stops for free — the control never knew about global indices, only
about positions in a list. `indexOf` of a level not in the list (a stale value
mid-switch) yields `-1`, clamped to `0`, and the next `thinking_changed` corrects
it.

## Risks / Trade-offs

- **The SDK returns a level name this build's `THINKING_LEVELS` does not have.** →
  The server drops it in the intersection step; the control only ever sees known
  levels. A test feeds an unknown name and asserts it is not offered.
- **`model_changed` must carry the new set, which means fetching it after the
  switch resolves.** → Read it in the same `.then()` that already reads
  `reasoning` after `setModel`. One extra call on a path that is already async and
  user-initiated.
- **OMP has no `get_available_thinking_levels`.** → Probed, not assumed; the field
  is omitted and the control falls back. An OMP integration test asserts the
  snapshot omits it and the control still offers the full set.
- **A model that accepts only `off`** (reasoning declared but no tiers) → the
  slider has one stop past `off` at most, or just `off`; it stays usable because
  `max` can equal `min`. The control already renders at `index 0`.

## Open Questions

None.
