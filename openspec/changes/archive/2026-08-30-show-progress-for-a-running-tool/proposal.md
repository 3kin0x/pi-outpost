## Why

An extension tool can take a long time — indexing, crawling, a remote job — and while it runs the tool card shows only its streamed text and a spinner. The tool often knows exactly how far along it is (the same function elsewhere drives a real progress bar), but there is no first-class way for it to say so, and no place for the UI to show it. The plumbing is already almost there: the pi SDK gives every tool an `onUpdate` callback, and pi-outpost already turns those into live `tool_update` messages — it just drops everything that is not text.

## What Changes

- A running tool MAY report a **completion fraction** — a number in `0..1` — as often as it likes while it executes. It rides on the partial result the tool already emits (`onUpdate({ …, details: { progress } })`); no change to the pi SDK.
- The `tool_update` server→client message gains an optional `progress` field carrying that fraction. Both the RPC runtime and the embedded runtime forward it.
- The tool card shows a **determinate progress bar** for a running tool once a fraction has arrived. Before the first fraction there is no bar; the last fraction stays on screen if a later update omits it; the bar disappears when the tool ends. The bar is chrome on the card, independent of whichever presentation renders the output.
- Out-of-range values are clamped to `0..1`; a non-number, `NaN`, or infinity is ignored for that update rather than shown or thrown. A fraction that goes backwards is shown as-is — no monotonic enforcement.
- The fraction is **ephemeral**: it is not written to session history, so a client that reconnects mid-run shows no bar until the tool sends its next update.
- Because the tool card is shared, the bar appears in the embedded widget (`@pi-outpost/embed`) as well.

## Capabilities

### New Capabilities

- `tool-progress`: how a running tool reports how far along it is, how that fraction travels from the tool to every connected client, and how the client shows it while the tool runs.

### Modified Capabilities

<!-- None. The edits to protocol.ts, the runtimes and the tool card are the implementation of the new capability's requirements, not changes to an existing capability's contract. -->

## Impact

- **Wire** — `shared/src/protocol.ts`: `tool_update` gains `progress?: number`. `server/src/agentRuntime.ts`: the internal `tool_update` event type gains it too.
- **Runtimes** — `server/src/rpcRuntime.ts` and `server/src/embeddedRuntime.ts` read `partialResult.details?.progress`; `server/src/index.ts` clamps it and includes it in the broadcast.
- **Client** — `shared` chat-item (tool kind) gains `progress?: number`; `ui/src/useAgent.ts` carries it onto the item on `tool_update` and clears it on `tool_end`; `ui/src/components/ToolCard.tsx` renders the bar while `running`.
- **Docs** — extension authoring reference gains a short note on reporting progress from a tool.
- No new dependency. No change to the pi SDK, to tool arguments, to session persistence, or to any tool that never reports progress — such a tool renders exactly as it does today.
