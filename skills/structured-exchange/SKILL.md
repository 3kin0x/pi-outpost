---
name: structured-exchange
description: Author a structured-exchange document — a graph, sequence, or table the interface renders natively, or a proposal to change one an external authority holds — and write figures of one into a document you are authoring. Use when asked to draw or diagram a structure, to propose an evolution of an existing model, to illustrate a report you are writing, or when a result would otherwise be a hand-written diagram.
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
and reasoned about, never proposed — though its rows may report what a change did
to them (see **Roles on a table's rows**).

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

## Roles on a table's rows

A table cannot be proposed, but it can *report* on a change it projects. Any row
may say what it plays, and the interface colours it the way it colours an added or
changed element in a graph:

```jsonc
"data": {
  "columns": ["id", "requirement", "status"],
  "rows": [
    { "role": "added",   "cells": ["REQ-5", "Log every actuation.", "draft"] },
    { "role": "changed", "cells": ["REQ-2", "Signal a fault within 200 ms.", "in review"] },
    { "role": "removed", "cells": ["REQ-3", "Read battery voltage at 10 Hz.", "withdrawn"] },
    { "cells": ["REQ-1", "Stop the vehicle within 40 m.", "approved"] }   // context
  ]
}
```

`role` is one of `added`, `changed`, `context`, `removed`. A row that declares none
reads as context when any other row declares one. Both row forms are accepted, so
`["REQ-1", "…"]` and `{ "cells": ["REQ-1", "…"] }` are the same row, and a table
that declares no role anywhere is rendered exactly as before roles existed.

Declare the role — do not put it in a column and expect the colours. A `status`
column is your data and is rendered as data; nothing infers a role from it.

## Grouping: containers

A graph or a sequence may declare **containers** — subsystems, layers, teams,
whatever the domain groups things into — and each element or participant may say
which one it belongs to.

```jsonc
"data": {
  "containers": [{ "id": "electrical", "label": "Electrical system" }],
  "nodes": [{ "id": "battery", "label": "Battery", "container": "electrical" },
            { "id": "driver",  "label": "Driver" }],          // in no container
  "edges": [{ "from": "driver", "to": "battery", "kind": "operates" }]
}
```

Four things to know:

- **Membership goes on the member**, never as a list of members on the container.
  An element belongs to one container or to none.
- **Relationships ignore grouping entirely.** They connect elements, they cross
  container boundaries freely, and an endpoint is never a container id. Naming a
  container as `from` or `to` is refused.
- **Containers do not nest.** A member names a container, never a chain of them.
- **A container nobody joins is fine.** Declare the group first and fill it later
  if that is what you mean; it is drawn as an empty box.

Naming a container the document does not declare is refused rather than quietly
ungrouped — an element shown outside a group it belongs to would misstate the
system you are describing.

In a sequence, the view puts a container's columns next to each other so its
header spans them. If you interleave two containers, the columns are reordered:
the first member of a container met brings the rest of that container with it,
and anything belonging to no container keeps its place. Declare participants in
the order you want them read.

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

> **Type your elements.** `kind` is optional on an element and you should almost
> always set it. The reader's view colours by it and builds a key from it, so a
> diagram whose elements carry no type arrives in a single flat grey — legible, and
> much harder to read than it needed to be.

```json
{
  "schema": "urn:structured-exchange:1",
  "kind": "graph",
  "data": {
    "nodes": [
      { "id": "gateway", "label": "API Gateway", "kind": "service" },
      { "id": "billing", "label": "Billing", "kind": "service" },
      { "id": "ledger", "label": "Ledger", "kind": "datastore" }
    ],
    "edges": [
      { "from": "gateway", "to": "billing", "kind": "calls" },
      { "from": "billing", "to": "ledger", "kind": "writes" }
    ]
  }
}
```

`kind` is an opaque string from your domain, on elements and relationships alike.
Nothing validates it against a list and nothing interprets it: it is shown, it tells
two otherwise identical things apart, and whatever applies the document is free to
map it onto its own type system.

Pick the vocabulary the domain already uses, and use it consistently — the same
concept must get the same string throughout a document, because that string is what
groups things in the key. Two or three types for a small diagram, rarely more than
about eight; past that the key stops helping.

A physical architecture might use `battery`, `converter`, `motor`, `controller`,
`sensor`; a software one `service`, `datastore`, `queue`, `external`; a stereotyped
model whatever its profile defines. Relationships likewise: `power`, `thermal`,
`communication` on a physical model, `calls`, `writes`, `publishes` on a software one.

## Proposing a change to something that exists

Name the artifact in `target`. Then:

- An element you do not mention is left alone. Omission never removes anything.
- **On anything carrying a `ref`, the fields you declare describe what is already
  there.** They are how the reader recognises it. They change nothing.
- **To change something, say so in `set`.** That is the only thing that is applied.
- To remove something, say so in `removals`, giving both the `ref` and whether it is
  an `"element"` or a `"relationship"` — a reference alone does not say which.

> **Say what you are removing.** A removal may also carry `label`, `kind`, and for a
> relationship `from` and `to`. Add them. The reader's application holds your document
> and nothing else — it cannot look up what `REL-88` stood for, so without them the
> approval gate reads "relationship: REL-88" and asks someone to approve deleting
> something they cannot see. These fields describe and never identify: `ref` is still
> what names the thing.

```json
{
  "schema": "urn:structured-exchange:1",
  "kind": "graph",
  "target": "architecture-v4",
  "removals": [
    { "type": "relationship", "ref": "REL-88",
      "kind": "calls", "from": "ledger", "to": "billing" }
  ],
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

- **The removal** names `REL-88` and says what it is: the `calls` from Ledger to
  Billing. The reader sees what goes, rather than an identifier.

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

**Moving something between containers is an ordinary change**: `"set": { "container":
"electrical" }` on an element that carries a `ref`, like any other field you change.
Containers themselves are not patched — they are declared afresh in every document.

## What the reader sees, and what the model sees

The structured document is rendered for the human and **does not reach the model** —
not even yours, on a later turn. So the result's ordinary text must stand on its own:
summarise what the structure says, well enough that the next question can be answered
without it. A document with a rich diagram and a one-line text is a document you
cannot reason about afterwards.

## Putting a diagram in a document you are writing

`present_structure` shows a document in the conversation. When you are *writing* a
file — a report, a design note, a README — a diagram belongs in that file instead,
and `write_structure_figure` puts it there:

```
write_structure_figure(
  path: "models/vehicle.json",
  output_path: "figures/power-train.svg",
  hide_relationship_kinds: ["diagnostic"]
)
```

It reads a structured-exchange document from the workspace, draws it, and writes one
`.svg`. Reference it from your Markdown as a relative path — `![Power
train](figures/power-train.svg)` — and the interface renders it in the preview.

Three things about it are worth knowing before you use it.

**The two hide lists are different vocabularies.** `hide_element_kinds` hides boxes by
their `kind`; `hide_relationship_kinds` hides arrows by theirs. The same name in both
means two unrelated things, and naming one where you meant the other hides nothing,
draws a perfectly valid figure of the whole document, and looks like it worked.

**Write one figure per view worth having.** A narrowed figure is the reason the tool
takes a narrowing at all: three figures each about one thing beat one figure of
everything, which is the diagram nobody reads. A figure that shows less than its
document says so, inside the picture, so a figure separated from its source is never
mistaken for the whole of it.

**A relationship whose endpoint you hid goes with it.** An arrow to a box that is not
drawn cannot be drawn. The result tells you how much of the document the figure shows,
so a narrowing that took more than you meant is visible in the answer rather than in
the file.

A table has no figure — it is data. Export it as a spreadsheet.

## Size

Collections and strings are bounded — 500 elements, 2000 relationships, 500-character
labels, among others; the schema states them all. Exceeding a bound is refused with a
diagnostic naming what was exceeded.

If you are near a limit, the question was too broad. Narrow the scope rather than
trimming the answer: a diagram of everything is one nobody can read, and a proposal
nobody can read is one nobody should approve.
