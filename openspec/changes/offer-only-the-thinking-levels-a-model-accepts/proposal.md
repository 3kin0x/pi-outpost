## Why

The thinking-level slider in `ModelBar` is built from one hardcoded list —
`THINKING_LEVELS = ["off","minimal","low","medium","high","xhigh"]` — and never
asks the model which of those it accepts. So a model that stops at `high`, or one
whose accepted set has a gap, gets a slider that offers levels the runtime then
silently clamps. Dragging to `xhigh` sends `set_thinking: xhigh`, the SDK clamps
it, `thinking_changed` echoes back the clamped level, and the thumb snaps
backward. The operator sees a control that "won't go past `high`" with no reason
given.

The SDK already knows the answer: `AgentSession.getAvailableThinkingLevels()`
embedded, and the `get_available_thinking_levels` RPC command. Nothing carries it
to the client.

## What Changes

- The runtime exposes the current model's **accepted thinking levels** — the
  ordered subset of `THINKING_LEVELS` the model will actually honour.
- The state snapshot carries that list, and `model_changed` carries the new list
  when the model changes (a different model accepts a different set).
- `ModelBar`'s thinking control builds its scale from that list instead of the
  global constant. Every stop on the slider is a level the model accepts; there
  is no position that snaps back. A set with a gap (accepts `low, medium, xhigh`
  but not `high`) is presented as three ordered stops, not a range with a hole.
- Where the list is unavailable — an older or OMP RPC child that does not answer
  `get_available_thinking_levels` — the control falls back to today's full list,
  so nothing regresses.
- No change to `set_thinking` validation or to the SDK's own clamping: this makes
  the control honest, it does not move the enforcement.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `api`: `GETWebSocket` — the state snapshot gains the current model's accepted
  thinking levels, alongside the model and thinking-level state it already
  carries.
- `components`: `RuntimeControls` — `ModelBar`'s thinking control SHALL offer only
  the levels supplied for the current model, falling back to the full set when
  none are supplied.

## Impact

- **Runtime** — `server/src/agentRuntime.ts` (`RuntimeSnapshot` gains the list),
  `server/src/embeddedRuntime.ts` (`session.getAvailableThinkingLevels()`),
  `server/src/rpcRuntime.ts` (the `get_available_thinking_levels` command, probed
  and cached like `get_commands`).
- **Wire** — `shared/src/protocol.ts`: the `hello` snapshot and the
  `model_changed` message gain `thinkingLevels?: ThinkingLevel[]`.
- **Client** — `ui/src/useAgent.ts` carries the list into state on `hello` and
  `model_changed`; `ui/src/components/ModelBar.tsx` `ThinkingControl` builds its
  slider from it.
- No new dependency. No change to `set_thinking`, to persistence, or to any model
  that already accepts the full set.
