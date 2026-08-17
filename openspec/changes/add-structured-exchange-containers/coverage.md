# Scenario coverage

Every scenario in the delta spec, and the test that would fail if the behaviour
broke. Read against the assertions rather than the test titles.

Nine of the twenty-one are carried unchanged from the current spec — a MODIFIED
requirement restates its whole block, so they appear in the delta without their
behaviour changing. They are listed for completeness and marked *(carried)*.

| Scenario | Covered by | Verdict |
|---|---|---|
| SchemaIsTheContract *(carried)* | `server/test/structuredExchangeConformance.test.ts` — every `valid/` case accepted by both the parser and the shipped CLI | covered |
| ValidationMakesNoNetworkRequest *(carried)* | `server/test/structuredExchangeGenerated.test.ts` — the check is generated and committed; no fetch exists in the path | covered |
| EnvelopeIsRejectedAgainstThePublishedSchema *(carried)* | conformance `invalid/`, incl. new `containers-over-the-ceiling.json` → `schema/maxItems` | covered |
| DocumentsWithoutContainersAreUnaffected | conformance: all 12 pre-existing `valid/` cases still pass untouched; `structuredExchange.test.ts` "emits exactly what it did before when nothing is grouped"; view "leaves declared column order alone when nothing is grouped" | covered |
| SchemaValidButSemanticallyInvalidIsRejected *(carried)* | `server/test/structuredExchangeParse.test.ts`, existing cases | covered |
| MembershipInAnUndeclaredContainerIsRejected | parse "refuses a membership naming a container the envelope does not declare"; conformance `invalid/container-unknown-membership.json` → `unresolved-container` | covered |
| RepeatedContainerIdentifierIsRejected | parse "refuses two containers sharing an identifier"; conformance `invalid/container-duplicate-id.json` | covered |
| ValidationNeverRepairs *(carried)* | parse, existing case | covered |
| ContradictoryProposalIsRefused *(carried)* | parse, existing case | covered |
| MembershipIsSingleValued | Structural: `container` is one string in the schema, so a second cannot be declared. Parse "accepts a document that groups some of its elements and not others" reads it back as a single value. No test can exercise the impossible case — the guarantee is the shape, not a check | covered (by construction) |
| AnElementNeedNotBelongAnywhere | parse "accepts a document that groups some of its elements and not others" — asserts the ungrouped node's `container` is `undefined` | covered |
| RelationshipsCrossContainersFreely | view "still renders a relationship that crosses a boundary"; conformance `valid/graph-with-containers.json` carries one; e2e draws it | covered |
| ContainersCannotBeEndpoints | parse "refuses a container identifier used as a relationship endpoint"; conformance `invalid/container-as-endpoint.json` → `unresolved-endpoint` | covered |
| AnEmptyContainerIsValid | parse "accepts a container no member names"; conformance `valid/graph-with-empty-container.json` | covered |
| AProposalMayMoveAMember | conformance `valid/graph-proposal-moves-a-member.json`; view "presents the move as a change to that element, like any other" (asserts `(changed)` and the from→to); parse refuses a move into an undeclared container | covered |
| EveryDeclaredContainerIsVisible | view "draws every declared container, including one no member names"; e2e "draws every declared container, including the one nothing joins" — asserts the empty one is on screen in the widget | covered |
| GraphMembersAreDrawnInsideTheirContainer | view "lays every member out inside its own container and no other" (containment arithmetic, and the outsider asserted outside); e2e the same in the browser; view "grows to keep a dragged member inside it" holds it true after the reader moves a box | covered |
| SequenceKeepsItsColumnsAndGainsAHeader | view "still draws one lifeline per participant and every message"; e2e reads the header spans back from the DOM | covered |
| InterleavedMembersAreOrderedContiguously | view "orders interleaved members so each container is drawn with one header" (asserts the reordered column list and one band per container); e2e the same against a real layout, plus the two headers proven non-overlapping | covered |
| GroupingDoesNotRestyleWhatItGroups | view "draws the elements and relationships exactly as it would without the grouping" — renders the same document twice, with and without containers, and compares element geometry and relationship count | covered |
| TextualEquivalentCarriesMembership | view "names every container, its members, and what belongs to none" — asserts the empty container is named, and that the ungrouped element is listed without being placed anywhere | covered |

## Red checks

Passing is not evidence a test bites. These were run against the reverted
behaviour and observed to fail:

- **Enclosure follows a drag** — reverted to drawing `layout.containers`:
  `1 failed | 154 passed`, the failure being "grows to keep a dragged member
  inside it".
- **Semantic validation** — before the container rules existed, conformance
  reported `invalid/container-unknown-membership.json should be refused, got
  exit 0` and the duplicate-identifier case the same way.
- **Derived artifacts** — the shipped CLI and the skill's own copy of the schema
  both failed the suite until regenerated, which is how that class of staleness
  is meant to be caught.

## Not asserted

`MembershipIsSingleValued` has no negative test, because the schema makes the
negative case unrepresentable. Recorded here rather than papered over with a test
that would only be asserting that TypeScript works.
