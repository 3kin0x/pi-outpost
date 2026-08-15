# Scenario-to-test matrix — add-structured-tool-results

All 52 `#### Scenario:` entries under `openspec/changes/add-structured-tool-results/specs/`,
enumerated with `rg '^#### Scenario:' openspec/changes/add-structured-tool-results/specs/`.

Test files, abbreviated below:

- **SE** `server/test/structuredExchange.test.ts` — the schema itself
- **SP** `server/test/structuredExchangeParse.test.ts` — two-stage validation
- **SB** `server/test/structuredExchangeBounds.test.ts` — the two bound levels
- **SC** `server/test/structuredExchangeConformance.test.ts` — the portable suite, both callers
- **SG** `server/test/structuredExchangeGenerated.test.ts` — the browser check and its drift guard
- **UX** `ui/src/presentations/structuredExchange.test.ts` — roles, layout, export
- **UV** `ui/src/presentations/StructuredExchangeView.test.tsx` — registry and rendered view
- **ST** `server/test/structuredExchangeTool.test.ts` — the tool the agent presents through

## `utilities`

| Scenario | Status | Test |
|---|---|---|
| ParserReturnsOneCompleteResult | covered | SP "accepts a complete document and returns it whole"; UX "accepts a conforming document" |
| ParserDoesNotGuess | covered | SP "refuses arbitrary JSON that merely resembles an envelope", "refuses an endpoint that is nearly a declared identifier" |
| ParserReturnsNothingForAnIncompleteDocument | covered | SP "refuses a truncated document rather than salvaging the part that parsed"; SB "unparseable JSON is refused without a recovery pass" |

## `tool-result-presentations`

| Scenario | Status | Test |
|---|---|---|
| ValidEnvelopeSelectsItsPresentation | covered | UV "selects the structured presentation for a validated envelope" |
| DeclaredDataOutranksAnInferredShape | covered | UV "outranks a presentation that infers its shape from output" (a result that would also match the hit-list guess) |
| ExtensionRenderingStillWins | covered | UV "does not outrank an extension's own rendering of its tool" |
| InvalidEnvelopeUsesTheNormalFallback | covered | UV "ignores an envelope that does not validate, falling back as usual" |

## `structured-exchange`

| Scenario | Status | Test |
|---|---|---|
| EnvelopeIsRejectedAgainstThePublishedSchema | covered | SE "refuses anything it did not declare"; SC every `schema/*` case |
| ValidationMakesNoNetworkRequest | **partial** | No test asserts the absence of a request. Held by construction: the validator reads `STRUCTURED_EXCHANGE_SCHEMA_PATH` from disk and no code path fetches. See the note below. |
| AReferenceIsQualifiedByWhatItNames | covered | SE "removals say what kind of thing they name"; SP "removing a relationship while changing an element of the same reference is fine" |
| RelationshipsResolveThroughEnvelopeIdentifiers | covered | SP "refuses an endpoint that is nearly a declared identifier" |
| ElementWithoutAReferenceIsNew | covered | UX "treats an element with no reference as an addition" |
| ReferencesSurviveUnaltered | covered | UV "keeps the document exactly as it was validated, not a re-serialisation of it" |
| RelationshipPatchDeclaresItsEndpoints | covered | SP "declared whether or not the relationship carries a reference"; SE "a relationship always declares its endpoints" |
| ReattachmentIsRemovalAndCreation | covered | SP "re-attachment is a removal and a creation" |
| OmissionDoesNotRemove | **partial** | Nothing generates a removal from an omission, so there is no code path to test. Asserted indirectly by SP "a referenced element declaring nothing else is context". |
| RemovalIsDeclared | covered | SP "name both a reference and what kind of thing they remove"; UV removals list |
| OnlyDeclaredFieldsChange | covered | SP "a referenced element may declare one field and leave the rest untouched"; UX "treats a reference with a declared field as a change" |
| AReferenceAloneIsContextNotAChange | covered | UX "treats a bare reference as existing context, not a change"; UV "distinguishes additions, changes, context, and removals" |
| AdditionOnlyProposalRemainsAPatch | covered | SP "an addition-only proposal is still a patch, though it carries no reference" |
| RemovalWithoutATargetIsRejected | covered | SP "a removal without a target is refused" |
| TableCarryingATargetIsRejected | covered | SP "a table carries neither a target nor a removal" |
| TableIsStillRenderedAndReadable | covered | UV "renders table columns and rows in their declared order" |
| RelationshipKindIsPreservedAndUninterpreted | covered | UV "accepts a relationship kind it has never seen and does not interpret it" |
| ParallelRelationshipsAreDistinct | covered | UV "keeps two relationships between the same pair distinct when their kinds differ" |
| SchemaValidButSemanticallyInvalidIsRejected | covered | SP "refuses a kind that disagrees with the data it carries"; SC `duplicate-identifier`, `unresolved-endpoint`, `row-column-mismatch` |
| ContradictoryProposalIsRefused | covered | SP "changing and removing the same thing is refused, not resolved by precedence" |
| ValidationNeverRepairs | covered | SP the whole "never repairs or guesses" block |
| OversizedDocumentIsRefusedBeforeParsing | covered | SB "an oversized document is refused without being parsed" (input is unparseable past the opening brace, so a parse-first implementation would report a different rule) |
| UnboundedStringIsRefused | covered | SB, SE "every collection and string in the schema is bounded" (walks the schema rather than listing what to check) |
| RefusalIdentifiesTheLimitThatBit | covered | SP "a bound refusal reports the limit, the observed value, and which level bit" |
| OperationalLimitIsStricterThanTheCeiling | covered | SB "past the deployment's limit but within the ceiling is refused, and says so" |
| AcceptedSizesAreObservable | covered | SB "acceptance reports what the document weighed" |
| ApprovedProposalIsByteForByteWhatWasValidated | **partial** | UV proves the document is not re-serialised on this side. What cannot be proven here is byte-identity with what the *producer* wrote: the SDK hands the server a parsed object, so the bytes are fixed at the server, not at the producer. See the note below. |
| ProducerValidatesBeforeEmitting | covered | SC "the command-line interface agrees with the parser" — every valid case, exit zero |
| ProducerReceivesActionableDiagnostics | covered | SC every invalid case exits 1 with the expected rule; SC "an unreadable input is distinguished from an invalid one" |
| ApplicationValidatesOnReceipt | covered | UV "selects the structured presentation for a validated envelope" / "ignores an envelope that does not validate" — the client validates independently of anything the producer claims |
| ProposalRendersAsItsChanges | covered | UV "distinguishes additions, changes, context, and removals" |
| EveryProposedElementIsShown | covered | UV "shows every element of a proposal at the contract's ceiling, none summarised" (500 elements, all drawn) |
| NewArtifactRendersAsItself | covered | UV "presents a new artifact as itself rather than as a set of changes" |
| GraphPreservesDeclaredRelationships | covered | UX layout tests; UV "shows every element it carries" |
| SequencePreservesDeclaredOrder | covered | UV "renders sequence messages in their declared order and direction" |
| TablePreservesDeclaredOrder | covered | UV "renders table columns and rows in their declared order" |
| ProducerTextRemainsInert | covered | UV "renders markup-like labels as text"; UX "keeps producer text from becoming diagram syntax" |
| ExportCarriesTheSameStructure | covered | UX "carries exactly the elements and relationships of the data it came from" |
| ExportIsDeterministic | covered | UX "is deterministic" |
| DiagramSyntaxIsNeverAnInput | **partial** | No parser of diagram syntax exists, so there is nothing to test. UX "keeps producer text from becoming diagram syntax" checks the adjacent risk: producer text cannot manufacture structure in the export. |
| OriginalOutputStaysReachable | covered | UV "keeps the original output available" |
| AgentPresentsAValidDocument | covered | ST "puts a validated document on the channel the interface reads"; confirmed in the running app |
| AgentReceivesTheDiagnosticsForARefusal | covered | ST "names the rule and points at the offending value"; confirmed in the running app on an unknown schema version |
| AgentCorrectsAndPresentsAgain | covered | ST "a corrected document is accepted on the next call"; confirmed in the running app, on a correction the agent made unprompted |
| UnsupportedVersionFallsBack | covered | SC `unknown-version`; UV "ignores an envelope that does not validate" |

## Summary

48 covered, 4 partial, 0 uncovered.

Each partial is a scenario whose subject has no code path to exercise, not a
behaviour left untested:

- **ValidationMakesNoNetworkRequest** — proving a negative. The Node validator reads a
  file path; the browser check is compiled code with no I/O at all. A test could only
  assert that a fetch stub was not called, which tests the stub.
- **OmissionDoesNotRemove** — nothing converts an omission into a removal, so the
  scenario describes the absence of a feature.
- **DiagramSyntaxIsNeverAnInput** — same shape: no diagram parser exists.
- **ApprovedProposalIsByteForByteWhatWasValidated** — provable from the server onward,
  and not before it. The SDK delivers `details` as a parsed object, so the serialized
  form is created at the server. The guarantee the implementation actually makes is
  "identical to what was validated and displayed", which is what the requirement asks
  for; "identical to what the producer typed" is not reachable through this transport
  and no test should imply it is.

## Confirmed in the running app

Driven through Playwright against a real server with the skill loaded, reading the DOM:

- Asked for a graph of three services. The agent's **first** call put `nodes`/`edges` at the
  top level instead of inside `data` and was refused; it read the diagnostic, corrected the
  document, and presented it on the second call — unprompted, and not a staged failure. The
  view then drew Gateway → Billing → Ledger with both `calls` relationships.
- Asked for a proposal against `architecture-v4`. The approval view distinguished all four
  states — `context` (a bare reference), `changed` (a reference with a label), `added` (no
  reference) — listed the declared removal `relationship: REL-88`, and named the target.
- Asked for a document with an unsupported schema version, verbatim. It was refused, no
  structured view appeared, and the result stayed readable.

One half of `UnsupportedVersionFallsBack` is not reachable from the running app and is worth
naming: an invalid envelope cannot arrive at the client through this tool, because the tool
validates first. The client's own fallback on a malformed envelope is covered by UV
"ignores an envelope that does not validate, falling back as usual" — which is a component
test, not an end-to-end one, and the honest statement is that no path in the running system
currently produces the input it guards against.
