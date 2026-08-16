# Scenario-to-test matrix — add-structured-tool-results

All 74 `#### Scenario:` entries under `openspec/changes/add-structured-tool-results/specs/`,
enumerated with `rg '^#### Scenario:' openspec/changes/add-structured-tool-results/specs/`.

Nineteen arrived after the first pass, describing behaviour that was built and then
specified: element kinds, the two-channel rendering that keeps type from competing
with change, the key, narrowing the view, relationship geometry that does not lose a
relationship, the textual equivalent's completeness, mutation needing a target, and a
validator that runs where a producer is.

**Evidence type** is stated for every row, because "covered" earned three different
ways is three different claims:

- *test* — an assertion that fails if the behaviour breaks
- *invariant* — held by construction; what is asserted is the construction, since a
  test of absent code only proves the code is still absent
- *out-of-repo* — proven by running the shipped artifact somewhere the repository is not

Test files, abbreviated below:

- **SE** `server/test/structuredExchange.test.ts` — the schema itself
- **SP** `server/test/structuredExchangeParse.test.ts` — two-stage validation
- **SB** `server/test/structuredExchangeBounds.test.ts` — the two bound levels
- **SC** `server/test/structuredExchangeConformance.test.ts` — the portable suite, both callers
- **SG** `server/test/structuredExchangeGenerated.test.ts` — the browser check and its drift guard
- **UX** `ui/src/presentations/structuredExchange.test.ts` — roles, layout, export
- **UV** `ui/src/presentations/StructuredExchangeView.test.tsx` — registry and rendered view
- **ST** `server/test/structuredExchangeTool.test.ts` — the tool the agent presents through
- **CLI** `server/test/structuredExchangeValidatorCli.test.ts` — the shipped validator, run from a temp dir
- **SK** `server/test/bundledSkill.test.ts` — the bundled skill, through the SDK's own loader

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
| ValidationMakesNoNetworkRequest | covered | The schema is now an `import` of the committed JSON rather than a fetch or a filesystem read, so there is no request to make. Proven end to end by running the built bundle from a directory with no access to this repository and presenting a document successfully — the check that caught the shipping bug this replaced. |
| AReferenceIsQualifiedByWhatItNames | covered | SE "removals say what kind of thing they name"; SP "removing a relationship while changing an element of the same reference is fine" |
| RelationshipsResolveThroughEnvelopeIdentifiers | covered | SP "refuses an endpoint that is nearly a declared identifier" |
| ElementWithoutAReferenceIsNew | covered | UX "treats an element with no reference as an addition" |
| ReferencesSurviveUnaltered | covered | UV "keeps the document exactly as it was validated, not a re-serialisation of it" |
| RelationshipPatchDeclaresItsEndpoints | covered | SP "declared whether or not the relationship carries a reference"; SE "a relationship always declares its endpoints" |
| ReattachmentIsRemovalAndCreation | covered | SP "re-attachment is a removal and a creation" |
| OmissionDoesNotRemove | covered *(invariant)* | UV "proposes no removal for something a proposal simply does not mention" and "presents exactly the removals declared, and no more". The invariant, stated: this application never holds the authority's model. It sees one document, so it cannot know what is absent from it and could not infer a removal even if the contract allowed one. Removals are declared or they do not exist — there is no inference to disable, and nothing to switch off wrongly. |
| RemovalIsDeclared | covered | SP "name both a reference and what kind of thing they remove"; UV removals list |
| OnlyDeclaredChangesChange | covered | SP "a referenced element may declare one field and leave the rest untouched"; UX "treats a reference with a declared field as a change" |
| DescribedFieldsAreNotChanges | covered | SP "a referenced element states a change in set, and its own fields describe"; UX "treats a referenced element's own fields as description, not intent" — the case the inverted default exists for |
| AChangeNamesSomethingThatExists | covered | SP "a change needs something to change: set without a reference is refused" and "an empty change is refused rather than treated as a no-op"; SC `change-without-reference`, `empty-change` |
| AChangeIsShownAsATransition | covered | UX "reports a change as a before and after when the current value was described"; UV "shows a change as a before and after, not merely as changed" |
| AReferenceAloneIsContextNotAChange | covered | UX "treats a bare reference as existing context, not a change"; UV "distinguishes additions, changes, context, and removals" |
| AdditionOnlyProposalRemainsAPatch | covered | SP "an addition-only proposal is still a patch, though it carries no reference" |
| ChangeWithoutTargetIsRefused | covered *(test)* | SC `change-without-target` and `relationship-change-without-target`; CLI "exits 1 for a document that was read and does not conform" asserts the rule by name through the shipped validator. The hole this closed: a `set` rode into a document claiming to describe a new artifact, asking an authority to mutate something the rendering drew as an unremarkable box |
| EmptyProposalFieldsAreStillRefusedOnAProjection | covered *(test)* | SC `table-with-empty-removals` — presence is the assertion, not length |
| RemovalWithoutATargetIsRejected | covered | SP "a removal without a target is refused" |
| TableCarryingATargetIsRejected | covered | SP "a table carries neither a target nor a removal" |
| TableIsStillRenderedAndReadable | covered | UV "renders table columns and rows in their declared order" |
| RelationshipKindIsPreservedAndUninterpreted | covered | UV "accepts a relationship kind it has never seen and does not interpret it" |
| ElementKindIsOptionalAndUninterpreted | covered *(test)* | SE "an element may declare its type, and a patch may retype it" — an unfamiliar vocabulary and a guillemet-wrapped stereotype both pass, an empty one does not; SE "an element and a relationship share one definition of a type" pins the two to one `$defs` so they cannot drift |
| ElementKindMayBeChangedByAPatch | covered *(test)* | SE "an element may declare its type, and a patch may retype it" (the `set: { kind }` half); UX "reads a relationship's declared fields as description too" covers the same rule on the other side |
| PresentationIsNeverCarriedByTheDocument | covered *(test)* | SE "presentation is not part of the exchange" — eight appearance-shaped properties (`colour`, `color`, `fill`, `style`, `x`/`y`, `position`, `width`, `icon`) refused on both an element and a relationship, and `kind` accepted in their place |
| ParallelRelationshipsAreDistinct | covered | UV "keeps two relationships between the same pair distinct when their kinds differ" |
| SchemaValidButSemanticallyInvalidIsRejected | covered | SP "refuses a kind that disagrees with the data it carries"; SC `duplicate-identifier`, `unresolved-endpoint`, `row-column-mismatch` |
| ContradictoryProposalIsRefused | covered | SP "changing and removing the same thing is refused, not resolved by precedence" |
| ValidationNeverRepairs | covered | SP the whole "never repairs or guesses" block |
| OversizedDocumentIsRefusedBeforeParsing | covered | SB "an oversized document is refused without being parsed" (input is unparseable past the opening brace, so a parse-first implementation would report a different rule) |
| UnboundedStringIsRefused | covered | SB, SE "every collection and string in the schema is bounded" (walks the schema rather than listing what to check) |
| RefusalIdentifiesTheLimitThatBit | covered | SP "a bound refusal reports the limit, the observed value, and which level bit" |
| OperationalLimitIsStricterThanTheCeiling | covered | SB "past the deployment's limit but within the ceiling is refused, and says so" |
| AcceptedSizesAreObservable | covered | SB "acceptance reports what the document weighed" |
| ApprovedProposalIsExactlyWhatWasValidated | covered *(test)* | UV "hands on exactly the value that was validated" — identity asserted from the real validation boundary, declaration order included, which a normalising step would not preserve. Renamed from *ByteForByte*: the SDK hands the server a parsed object, so the producer's bytes do not exist on this side and promising identity with them would be a promise nothing keeps. What is guaranteed, and tested, is that nothing between validation and handover normalises, reorders or re-encodes. |
| ProducerValidatesBeforeEmitting | covered | SC "the command-line interface agrees with the parser" — every valid case, exit zero |
| TheValidatorRunsWhereTheProducerIs | covered *(out-of-repo)* | CLI "runs at all, outside the repository, with nothing installed" and "agrees with the application on every conformance case" — the bundle copied to a temporary directory with no `node_modules`, no `package.json` and no path back here. It earned itself immediately: the first bundle carried two shebangs and was a syntax error, while every in-repo test stayed green |
| RefusalIsDistinguishedFromUnreadableInput | covered *(test)* | CLI "exits 1 for a document that was read and does not conform", "exits 2 when the input cannot be read, rather than blaming the schema", "exits 3 when the input is not JSON", and "says how to use it, and documents its exit codes where a caller will look" |
| ProducerReceivesActionableDiagnostics | covered | SC every invalid case exits 1 with the expected rule; SC "an unreadable input is distinguished from an invalid one" |
| ApplicationValidatesOnReceipt | covered | UV "selects the structured presentation for a validated envelope" / "ignores an envelope that does not validate" — the client validates independently of anything the producer claims |
| ProposalRendersAsItsChanges | covered | UV "distinguishes additions, changes, context, and removals" |
| EveryProposedElementIsShown | covered | UV "shows every element of a proposal at the contract's ceiling, none summarised" (500 elements, all drawn) |
| NewArtifactRendersAsItself | covered | UV "presents a new artifact as itself rather than as a set of changes" |
| GraphPreservesDeclaredRelationships | covered | UX layout tests; UV "shows every element it carries" |
| SequencePreservesDeclaredOrder | covered | UV "renders sequence messages in their declared order and direction" |
| TablePreservesDeclaredOrder | covered | UV "renders table columns and rows in their declared order" |
| ACyclicGraphIsStillLegible | covered *(test)* | UX "keeps a cyclic architecture to a readable extent" (extent bounded against the element count, and real height rather than one row) and "never overlaps two boxes"; UV "draws every element and every relationship, none overlapping" on a thirty-three element architecture. The failure behind it: a hand-rolled ranking reached depth 104 on seventeen elements, drew twenty thousand pixels wide and arrived as an empty line |
| TwoTypesNeverLookAlike | covered *(test)* | UV "gives fourteen element types fourteen distinct colours" and "gives the same type the same colour, and different types different ones". Found twice on real data — five types in four colours, then fourteen element types sharing a table with thirty-four relationship types and four pairs coming out alike |
| TypeDoesNotObscureChange | covered *(test)* | UV "keeps the approval signal when a proposal is also typed" — same fill for the same type, and the role still telling them apart by outline colour and weight |
| TheKeyTravelsWithTheFigure | covered *(test)* | UV "names every type present in a key inside the SVG, so an exported figure explains itself" (asserts the key is inside the `svg`, not beside it on the page), "keeps the key inside the canvas it is drawn on", and "keeps the key a block, however wide the drawing gets" |
| ASelfRelationshipIsVisible | covered *(test)* | UV "draws a relationship from something to itself as a shape with real extent" — measured as span, not as presence in the DOM. It was a line of zero length: declared in the document, invisible in the picture |
| ParallelRelationshipsAreDrawnApart | covered *(test)* | UV "draws two relationships between the same pair as two distinct shapes" (distinct, and genuinely apart by more than eight units), "fans three relationships between one pair to either side of the straight run", "gives opposite directions between the same pair their own straight run each", and "keeps several loops on one element apart from each other" |
| TheTextualEquivalentOmitsNothingVisual | covered *(test)* | UV "the text equivalent says everything the picture says" — ten assertions over a graph and a sequence carrying kinds, changes, removals, a self-relationship and a participant no message reaches. Both renderings now derive from one presentation model (`describeStructure`), which is what stops them drifting again |
| EverythingIsShownUntilTheReaderNarrowsIt | covered *(test)* | UV "shows everything until the reader hides something" |
| NarrowingIsReversibleAndDeclared | covered *(test)* | UV "says on screen that the picture is no longer the whole document", "restores everything from the banner", "tells assistive technology that what it is describing is a subset", and "hides a type when its key entry is clicked, and brings it back on a second click" — driven through a real `pointerdown → pointerup → click`, after a synthetic click hid a total break for a session |
| ANarrowedProposalStillSaysWhatItProposes | covered *(test)* | UV "draws only what is shown, and says so inside the figure", "says on a proposal that a hidden type is still part of it", "carries that note into the serialized markup, not only onto the screen", and "never marks a hidden type the way it marks a removed one" — struck-through already means removed a few pixels away in the same view |
| ElementAndRelationshipVocabulariesAreIndependent | covered *(test)* | UV "hides a relationship type without hiding an element type of the same name" and its converse, plus "lists the shared name once per vocabulary" |
| AdjustmentDoesNotAlterTheDocument | covered *(test)* | UV "leaves the document untouched after a box is moved and a type is hidden" — asserts the view did change first, so it is not a test of a no-op |
| ProducerTextRemainsInert | covered | UV "renders markup-like labels as text"; UX "keeps producer text from becoming diagram syntax" |
| ExportCarriesTheSameStructure | covered | UX "carries exactly the elements and relationships of the data it came from" |
| ExportIsDeterministic | covered | UX "is deterministic" |
| DiagramSyntaxIsNeverAnInput | covered *(invariant)* | UV "never reads diagram syntax back, whatever is sitting beside the data" drives a result whose own output is hostile mermaid and asserts the rendering is unchanged by it; UV "offers no way to turn diagram syntax into a document" asserts the module's surface — an export exists and no counterpart import does. The invariant: the export is a one-way door, and no parser of diagram syntax appears anywhere in the path that produces, completes or corrects a document. The hostile-export tests are separate and remain so. |
| OriginalOutputStaysReachable | covered | UV "keeps the original output available" |
| AgentPresentsAValidDocument | covered | ST "puts a validated document on the channel the interface reads"; confirmed in the running app |
| AgentReceivesTheDiagnosticsForARefusal | covered | ST "names the rule and points at the offending value"; confirmed in the running app on an unknown schema version |
| AgentCorrectsAndPresentsAgain | covered | ST "a corrected document is accepted on the next call"; confirmed in the running app, on a correction the agent made unprompted |
| UnsupportedVersionFallsBack | covered | SC `unknown-version`; UV "ignores an envelope that does not validate" |

## Summary

74 covered, 0 partial, 0 uncovered — 59 by test, 2 by architectural invariant, 2 by
running the shipped artifact outside this repository, and the rest by the tests named
against each row.

## What the three former partials turned out to be

None of them was an untested behaviour, and none was three missing end-to-end tests.

**OmissionDoesNotRemove** and **DiagramSyntaxIsNeverAnInput** are invariants. Testing
that absent code stays absent proves nothing, so what is asserted is the construction:
that this application never holds the authority's model and so has nothing from which
to infer a removal, and that the module exposes an export and deliberately no
counterpart import. Each also has a behavioural test beside it — a proposal that
mentions almost nothing produces no removals, and a result whose own output is hostile
diagram syntax changes the rendering not at all.

**ApprovedProposalIsByteForByteWhatWasValidated** was the interesting one: the
wording promised something the transport cannot deliver. The SDK hands the server a
parsed object, so the producer's bytes do not exist on this side and no test could
honestly assert identity with them. Renamed to **ApprovedProposalIsExactlyWhatWasValidated**,
which is both what the implementation guarantees and what the requirement was for:
nothing between validation and handover normalises, reorders or re-encodes. Asserted
from the real validation boundary, declaration order included.
