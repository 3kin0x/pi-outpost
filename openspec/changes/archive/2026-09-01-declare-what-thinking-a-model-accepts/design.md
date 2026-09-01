## Context

See proposal.md — Why.

The mechanism that exists: `RuntimeSnapshot.thinkingLevels` is filled by the runtime — `session.getAvailableThinkingLevels()` embedded, `get_available_thinking_levels` over RPC — normalised through `normalizeThinkingLevels` in `shared/src/protocol.ts`, and carried to the client on `hello` and `model_changed`. `ModelBar` builds its slider from that list, or from the full set when there is none.

What does not exist: any way for an operator to answer the question themselves. `config.ts` has no thinking setting, so the only source is a runtime that, for a model declared against an in-house endpoint, has nothing to say. The current model is `snapshot().model` — a `{ provider, id }` pair — so a configured declaration has something to key on.

## Goals / Non-Goals

**Goals:**

- Let a deployment state what its own model accepts, and be believed.
- Cover a whole endpoint in one entry, since an in-house provider often serves several models with the same answer.
- Refuse a level the deployment has excluded, wherever the request comes from.
- Leave a deployment that declares nothing behaving exactly as it does today.

**Non-Goals:**

- Changing the control: it already offers exactly the list it is handed.
- Changing what runtimes report, or the SDK's own clamping.
- Per-workspace declarations: the model catalogue is server-wide, and so is this.
- A way to declare anything else about a model. `allowedModels` restricts which exist; this describes one property of one. Neither is a general model-metadata store.

## Decisions

### Keyed by provider, optionally by model, most specific wins

```json
"thinkingLevels": [
  { "provider": "maison", "levels": ["off"] },
  { "provider": "maison", "id": "big", "levels": ["off", "low", "medium"] }
]
```

An entry without `id` covers the provider. Where both could apply, the one naming the model wins: it is the more deliberate statement, and the provider-wide entry is by nature the rougher one.

*Alternative — a flat map of `"provider/id"` strings.* Reads compactly and cannot express "every model of this endpoint", which is the case that prompted this.

*Alternative — a single global list.* One in-house model does not mean every model in the deployment is limited, and a global switch would quietly cap the built-in ones too.

### The declaration wins over the runtime

Not "fills the gap when the runtime says nothing". The setting exists because the runtime is guessing, and a guess that overrode the operator would leave them nowhere to put what they know. An operator who declares a set has looked at their own endpoint; the SDK has inferred from a name it does not recognise.

### Normalised exactly like a runtime list, and empty is an error

The configured list goes through the same `normalizeThinkingLevels` as a reported one: unknown names dropped, canonical order imposed, `off` ensured. One implementation, so a configured list and a reported one cannot drift into meaning different things.

An entry that normalises to nothing — an empty list, or only unknown names — fails startup. A model that accepts no level at all cannot be asked for anything, so it is far likelier to be a typo than an intention, and the moment to say so is boot.

### Refusal, not only omission

The control offers only the declared levels, so a well-behaved client never asks for another. Refusal is for every other route: an embedded widget, a client reconnecting with a level the deployment has since narrowed, a script. The existing `set_thinking` already refuses a level outside `THINKING_LEVELS`; this narrows that gate when a declaration exists, and leaves it exactly where it was when none does.

*Alternative — forward it and let the model clamp.* That is today's behaviour, and it is what makes a slider snap backwards with no reason given. A model that cannot think has nothing to clamp toward.

## Risks / Trade-offs

- **A stale declaration outlives the model it described** — an endpoint gains thinking, the config still says `off`. → It is the operator's statement, and remains theirs to update; the setting is documented beside `allowedModels`, where a deployment's model policy already lives.
- **A declaration disagreeing with a runtime that was right** narrows a model unnecessarily. → Visible in the control and in the file that caused it, and the fix is one line. The opposite failure — a control offering levels a model cannot honour — is the one that has no visible cause at all.
- **Refusing `set_thinking` silently could puzzle a client** that believes it set a level. → The runtime already answers with what it settled at, and the refusal leaves the current level in place, so a client that reads the answer sees the truth.

## Migration Plan

No migration. Absent the setting, every path is unchanged: the runtime's list is used, and `set_thinking` refuses exactly what it refused before. Rollback is a revert.
