# Structured exchange — for producers

A tool can return structured data alongside its text, and this application will render
it natively: a graph, a sequence, or a table, drawn from the data rather than from
anything the tool wrote for display. When the document names a target it is read as a
*proposal* to change something an external authority holds, and its rendering becomes
the approval gate before that change is applied.

This page is for whoever writes such a producer. The normative contract is
[`shared/schemas/structured-exchange-1.json`](../shared/schemas/structured-exchange-1.json).

## The two payloads, and why you owe both

A tool result carries two things, and they go to different readers:

| Channel | Reaches | Carries |
|---|---|---|
| the result's text content | **the model** | what the agent will reason about later |
| `details` | **the interface only** | the structured document |

The SDK defines `details` as metadata the LLM does not see. That is what makes it the
right home for a 500-element graph — the model pays nothing for it — and it is exactly
why the text half is not optional.

**A producer that emits only the structured document leaves the agent with nothing to
reason about.** It will render beautifully and be useless on the next turn, when the
agent is asked a follow-up question about a structure it cannot see. Summarise the
structure in the text: what it contains, what changed, what matters.

The reverse also holds: text alone gets you today's behaviour, a wall of prose.

## Describing is not changing

On anything carrying a `ref`, the fields you declare beside it **describe what the
authority already holds**. They are how a reader recognises the thing. They are not
applied. An intended change goes in `set`:

```json
{ "id": "ledger", "ref": "EL-7", "label": "Ledger",
  "set": { "label": "General Ledger" } }
```

Two consequences worth stating plainly.

**Include as much context as the reader needs.** Elements carried purely so the
proposal can be situated cost nothing and change nothing. A proposal nobody can place
is a proposal nobody should approve.

**The default runs this way round because producers forget.** Were a declared field
taken as an intended change, a producer including twenty elements for context would be
proposing twenty renames to the names those elements already have — and the reader,
seeing them marked as changes, could approve them. This way a forgotten `set` changes
nothing and somebody says "it didn't work". A generative producer's mistakes have to
fail inert.

A `set` on something with no `ref` is refused: there is nothing there to change, and
its fields are already its values.

## Emitting a document

Put the envelope in your tool result's `details`:

```js
return {
  content: [{ type: "text", text: "Billing now calls Ledger. 12 elements, 1 added." }],
  details: {
    schema: "urn:structured-exchange:1",
    kind: "graph",
    data: {
      nodes: [{ id: "billing", label: "Billing" }, { id: "ledger", label: "Ledger" }],
      edges: [{ from: "billing", to: "ledger", kind: "calls" }],
    },
  },
};
```

The server forwards anything whose `schema` starts with `urn:structured-exchange:`
and validates nothing — validation happens where the rendering decision is made.

## The agent as a producer

The agent can author these too, guided by [`skills/structured-exchange`](../skills/structured-exchange/SKILL.md).
It presents one through the `present_structure` tool, which validates before showing
anything and hands back the diagnostics when it refuses, so a document can be corrected
without leaving the exchange.

## Validating before you emit

```
node --import tsx/esm shared/bin/validate-structured-exchange.mjs document.json
```

Exit 0 accepts, 1 refuses, 2 means the input could not be read — which is not the
same as invalid, and your build should not treat it as if it were.

Diagnostics name the rule and point at the value:

```json
{"valid": false, "issues": [
  {"rule": "unresolved-endpoint", "path": "/data/edges/0/to",
   "message": "\"ledgr\" is not an identifier declared in /data/nodes"}
]}
```

Every broken rule is reported, not just the first.

## Getting a diagram into a document

Use **download SVG**, then insert the file as a picture. Word does not accept an SVG
pasted from the clipboard — it wants a file. **copy markup** is there for the places
that do take it directly: an editor, a wiki, a repository.

The markup stands on its own. Boxes are `rect` and `text` with colours as attributes
and an explicit white ground, so what lands in the document is what was on screen. An
earlier version drew them as HTML inside `foreignObject`, which looks identical in the
browser and loses everything the moment it is serialized.

## If you are not building in this repository

You do not need our command-line interface, and you do not need this repository. The
contract ships with the package, under `contract/`:

```
node_modules/pi-outpost/dist/contract/
  schemas/structured-exchange-1.json   the normative schema — any validator runs it
  conformance/                          documents and the verdict each should get
  README.md                             this page
```

- The **schema** is what the application validates against, byte for byte: it is the
  same file, copied at build time rather than restated.
- The **conformance suite** covers the relational rules JSON Schema cannot express.
  Run your implementation against it; if it agrees on every case, it conforms.

In this repository the same two live at `shared/schemas/` and `shared/conformance/`.

## What is deliberately not here

**Delivery.** How an approved proposal reaches the authority that applies it, and what
that authority reports back, is a separate contract. What this one guarantees is that
an approved proposal survives unaltered and can be recovered exactly as it was
validated — the precondition any delivery mechanism needs.

**Concurrency.** A document names *which* artifact it targets, not which revision. A
proposal built from a stale export and applied late is the receiving authority's to
detect; this contract does not carry what it would need to do so.

**A vocabulary.** Relationship kinds are opaque strings. What `calls`, `composition`,
or anything else means belongs to your domain, and enumerating it here would make a
provider-neutral contract into somebody's particular one.
