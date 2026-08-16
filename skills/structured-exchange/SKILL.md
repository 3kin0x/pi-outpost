---
name: structured-exchange
description: Author a structured-exchange document — a graph, sequence, or table the interface renders natively, or a proposal to change one an external authority holds. Use when asked to draw or diagram a structure, to propose an evolution of an existing model, or when a result would otherwise be a hand-written diagram.
allowed-tools: Bash(node:*)
license: MIT
metadata:
  version: "1.0"
---

# Authoring a structured-exchange document

Emit **data**, not a diagram. The interface renders the diagram from your data; a
diagram you draw by hand is syntax it has to guess at, and cannot be approved,
validated, or applied.

> **The one rule that trips everyone up.** When you propose a change to something
> that already exists, the fields you write beside its `ref` say *what it is called
> now*. They are not applied. The new value goes in `set`.
>
> ```json
> { "id": "ledger", "ref": "EL-7", "label": "Ledger",
>   "set": { "label": "General Ledger" } }
> ```
>
> Writing `"label": "General Ledger"` on its own does **not** rename anything — it
> claims that is already its name, and the proposal silently does nothing. If the
> tool answers `0 changed`, this is what happened.

Everything you need is on this page. The normative contract sits beside it, as
`structured-exchange-1.json` in this same directory — read it when a detail here is
not enough, and do not go hunting elsewhere in the workspace for it.

## The tool validates for you

`present_structure` checks the document before showing anything. A refusal comes back
as an error naming the rule and pointing at the offending value with a JSON Pointer.
**Read it, fix the document, call again.** That is the loop; it is not a dead end.

Nothing is repaired for you. An endpoint one character off a declared identifier is
refused, never corrected — correcting it would produce a document you did not write.

## The envelope

```json
{
  "schema": "urn:structured-exchange:1",
  "kind": "graph",
  "data": { "nodes": [...], "edges": [...] }
}
```

`kind` is `graph`, `sequence`, or `table`. A table is a projection: it can be shown
and reasoned about, never proposed.

Each carries its own `data`:

```jsonc
// graph — things and directed relationships between them
"data": { "nodes": [{ "id": "a", "label": "A" }],
          "edges": [{ "from": "a", "to": "b", "kind": "calls" }] }

// sequence — participants and ordered messages between them
"data": { "participants": [{ "id": "a", "label": "Client" }],
          "messages": [{ "from": "a", "to": "b", "label": "POST /orders" }] }

// table — columns and rows aligned to them
"data": { "columns": ["requirement", "satisfied by"],
          "rows": [["REQ-1", "Billing"]] }
```

A message declares a `label` and no `kind` — the label *is* what is being sent.
Message order is the order you write them in; nothing sorts them for you.

## Two identities, never confused

Every element carries an `id`, and may carry a `ref`.

- **`id`** is local to your document. Relationships point at it. It means nothing
  outside the document you are writing, so make it readable — `payment-service`,
  not `n1`.
- **`ref`** is the identifier the external authority already holds for that element.
  Use it only when you know it, from something that was given to you. **Never invent
  one.** An element with no `ref` is understood as new.

Give a referenced element its **current** label whenever you know it. Without one the
reader sees the bare reference — `EL-12` instead of `Billing` — which is exactly the
context they needed and did not get.

## Describing something new

Leave `target` out. Every element declares its `label`; every relationship declares
its `kind`.

```json
{
  "schema": "urn:structured-exchange:1",
  "kind": "graph",
  "data": {
    "nodes": [
      { "id": "gateway", "label": "API Gateway" },
      { "id": "billing", "label": "Billing" }
    ],
    "edges": [{ "from": "gateway", "to": "billing", "kind": "calls" }]
  }
}
```

`kind` on a relationship is an opaque string from your domain. Nothing validates it
against a list, and nothing interprets it — it is shown, and it tells two otherwise
identical relationships apart.

## Proposing a change to something that exists

Name the artifact in `target`. Then:

- An element you do not mention is left alone. Omission never removes anything.
- **On anything carrying a `ref`, the fields you declare describe what is already
  there.** They are how the reader recognises it. They change nothing.
- **To change something, say so in `set`.** That is the only thing that is applied.
- To remove something, say so in `removals`, giving both the `ref` and whether it is
  an `"element"` or a `"relationship"` — a reference alone does not say which.

```json
{
  "schema": "urn:structured-exchange:1",
  "kind": "graph",
  "target": "architecture-v4",
  "removals": [{ "type": "relationship", "ref": "REL-88" }],
  "data": {
    "nodes": [
      { "id": "billing", "ref": "EL-12", "label": "Billing" },
      { "id": "ledger", "ref": "EL-7", "label": "Ledger",
        "set": { "label": "General Ledger" } },
      { "id": "audit", "label": "Audit" }
    ],
    "edges": [{ "from": "audit", "to": "billing", "kind": "calls" }]
  }
}
```

Read that proposal:

- **`billing`** has a `ref` and a name, no `set` → **context**. It exists, it is shown
  so you can see where the new thing attaches, and nothing happens to it.
- **`ledger`** has a `ref`, its current name, and a `set` → **a change**. The reader
  sees `Ledger → General Ledger`, which is what makes it approvable.
- **`audit`** has no `ref` → **new**. With nothing to describe, its `label` is simply
  its value.

**Include as much context as the reader needs.** That is what the default is for: an
element you include to make the picture legible costs nothing and changes nothing.
Leaving it out to be safe is the wrong instinct — a proposal nobody can situate is a
proposal nobody should approve.

### Two rules that catch people out

**Never put a `set` on something with no `ref`.** There is nothing to change; its
fields are already its values. Refused.

**Never both `set` and remove the same `ref`.** That states two intentions at once and
is refused rather than resolved — decide which you meant.

**A relationship always declares `from` and `to`**, even when it carries a `ref`. Its
endpoints are its identity, not something you patch. To re-attach a relationship,
remove it and declare a new one.

## What the reader sees, and what the model sees

The structured document is rendered for the human and **does not reach the model** —
not even yours, on a later turn. So the result's ordinary text must stand on its own:
summarise what the structure says, well enough that the next question can be answered
without it. A document with a rich diagram and a one-line text is a document you
cannot reason about afterwards.

## Size

Collections and strings are bounded — 500 elements, 2000 relationships, 500-character
labels, among others; the schema states them all. Exceeding a bound is refused with a
diagnostic naming what was exceeded.

If you are near a limit, the question was too broad. Narrow the scope rather than
trimming the answer: a diagram of everything is one nobody can read, and a proposal
nobody can read is one nobody should approve.
