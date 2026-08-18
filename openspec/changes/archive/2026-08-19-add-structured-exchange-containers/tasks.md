## 1. The contract

- [x] 1.1 Add `$defs/container`, `container` on `element` and on `elementChange`, and an optional
      `containers` array (`maxItems: 50`) to the graph and sequence shapes in
      `shared/schemas/structured-exchange-1.json`
- [x] 1.2 Regenerate `shared/src/generated/structuredExchangeCheck.ts` and confirm the generated
      check no longer pins `data` to exactly its old keys
- [x] 1.3 Extend the shared types in `shared/src/structuredExchange.ts` so a container and a
      membership are expressible without a cast
- [x] 1.4 Confirm every existing conformance case still passes untouched — the addition is optional,
      so nothing valid before may become invalid

## 2. Conformance corpus

- [x] 2.1 `valid/graph-with-containers.json` — members in two containers, one element in none, and
      an edge crossing between them
- [x] 2.2 `valid/sequence-with-containers.json` — participants in two containers
- [x] 2.3 `valid/graph-with-empty-container.json` — a container no member names
- [x] 2.4 `valid/graph-proposal-moves-a-member.json` — `set: { container: … }` on an element carrying
      a `ref`
- [x] 2.5 `valid/graph-containers-at-the-ceiling.json` — 50 containers
- [x] 2.6 `invalid/container-unknown-membership.json`, `invalid/container-duplicate-id.json`,
      `invalid/container-as-endpoint.json`, `invalid/containers-over-the-ceiling.json`
- [x] 2.7 Run the conformance suite and confirm each new invalid case is refused for the stated
      reason rather than incidentally

## 3. Semantic validation

- [x] 3.1 Reject a membership naming a container the envelope does not declare, without dropping the
      membership to salvage a render
- [x] 3.2 Reject two containers sharing an identifier
- [x] 3.3 Confirm a container identifier is not accepted as a relationship or message endpoint
- [x] 3.4 Unit tests for 3.1–3.3, each asserting the refusal and that no partial structure comes back

## 4. Graph rendering

- [x] 4.1 `layoutGraph`: `compound: true`, `setParent` per member, and cluster rectangles returned
      alongside nodes and edges
- [x] 4.2 `GraphView`: draw each container as an enclosure with its label, behind the elements, in
      the view's existing styling vocabulary
- [x] 4.3 Draw a container no member names, at a size that reads as a container
- [x] 4.4 Unit tests: every member inside its own enclosure and no other; an edge between containers
      still rendered; the same document without containers laid out as before
- [x] 4.5 An enclosure is measured from the members as drawn, so it follows one the
      reader drags rather than staying where the layout put it

## 5. Sequence rendering

- [x] 5.1 Order columns so a container's members are contiguous, by the rule in the spec — first
      mention decides container order, declared order decides within a container, an ungrouped
      participant keeps its place
- [x] 5.2 Draw a container as a header spanning its members' columns; leave lifelines, messages and
      message order untouched
- [x] 5.3 Unit tests: the interleaved case orders columns and draws one header per container; a
      document with no containers keeps its declared column order exactly

## 6. Everything downstream of the data

- [x] 6.1 Textual equivalent: name every declared container, including an empty one, and state each
      member's container
- [x] 6.2 Derived diagram syntax: emit `subgraph` for a graph and `box` for a sequence
- [x] 6.3 `show envelope` and the raw output keep working unchanged for a document with containers
- [x] 6.4 Update the bundled structured-exchange skill so a producer is told containers exist and how
      membership is declared

## 7. Proof in the running app

- [x] 7.1 Seed the e2e transcript with a graph and a sequence carrying containers, including one
      sequence whose members interleave
- [x] 7.2 Playwright: containers visible with their labels in the embedded widget, members inside
      their enclosure, sequence headers spanning the right columns
- [x] 7.3 Playwright: enlarge still works on a diagram with containers, in the shadow root
- [x] 7.4 Delete `ui/src/presentations/ContainersPrototype.tsx`, its NOTES file and its registry
      entry — the prototype has answered its question

## 8. Close out

- [x] 8.1 `npm run typecheck`, the UI suite, the server suite and the Playwright suite all green
- [x] 8.2 Every scenario in the delta spec mapped to a test that would fail if the behaviour broke
- [x] 8.3 `openspec validate add-structured-exchange-containers --strict`
