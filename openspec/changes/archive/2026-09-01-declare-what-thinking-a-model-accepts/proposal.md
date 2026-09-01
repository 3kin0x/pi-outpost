## Why

The thinking-level control offers only what the current model accepts — but only when the runtime can say. For a model the SDK does not know, it cannot: a model declared against an in-house OpenAI-compatible endpoint reports nothing, the client falls back to the full set, and the operator gets a slider offering `xhigh` to a model that cannot think at all.

There is no way to state the answer. `config.ts` has no thinking setting of any kind, so an operator who knows exactly what their model does has nowhere to write it down. The only mechanism is a question the runtime cannot answer for precisely the models whose capabilities are least discoverable.

## What Changes

- Add an optional configuration setting declaring which thinking levels a model accepts, keyed by provider and optionally by model id — a provider-wide entry covers every model of an in-house endpoint without naming each one.
- A configured declaration SHALL be authoritative: it replaces what the runtime reports rather than filling a gap in it. An operator stating what their deployment's model does is stating a fact the SDK was guessing at.
- Refuse a thinking level the configuration excludes, rather than passing it to a model that cannot honour it. The control already will not offer one; a client that is not the control could still ask.
- Validate the setting at load: an unknown level name, or a malformed entry, fails startup naming the setting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `config`: Add the optional per-model thinking-level declaration, and its validation.
- `api`: The snapshot's accepted-levels list comes from configuration when one is declared, and `set_thinking` refuses a level the configuration excludes.

## Impact

- `server/src/config.ts`: the setting, its shape, its validation and its error.
- `server/src/index.ts`: the declaration overriding the runtime's list in the snapshot and on a model change, and the `set_thinking` refusal.
- User documentation for the setting, alongside `allowedModels`.
- No change to the control itself: it already offers exactly the list it is given.
- No change to what the runtime reports, or to the SDK's own clamping.
