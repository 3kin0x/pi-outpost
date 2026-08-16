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
| ApprovedProposalIsExactlyWhatWasValidated | covered *(test)* | UV "hands on exactly the value that was validated" — identity asserted from the real validation boundary, declaration order included, which a normalising step would not preserve. Renamed from *ByteForByte*: the SDK hands the server a parsed object, so the producer's bytes do not exist on this side and promising identity with them would be a promise nothing keeps. What is guaranteed, and tested, is that nothing between validation and handover normalises, reorders or re-encodes. |
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
| DiagramSyntaxIsNeverAnInput | covered *(invariant)* | UV "never reads diagram syntax back, whatever is sitting beside the data" drives a result whose own output is hostile mermaid and asserts the rendering is unchanged by it; UV "offers no way to turn diagram syntax into a document" asserts the module's surface — an export exists and no counterpart import does. The invariant: the export is a one-way door, and no parser of diagram syntax appears anywhere in the path that produces, completes or corrects a document. The hostile-export tests are separate and remain so. |
| OriginalOutputStaysReachable | covered | UV "keeps the original output available" |
| AgentPresentsAValidDocument | covered | ST "puts a validated document on the channel the interface reads"; confirmed in the running app |
| AgentReceivesTheDiagnosticsForARefusal | covered | ST "names the rule and points at the offending value"; confirmed in the running app on an unknown schema version |
| AgentCorrectsAndPresentsAgain | covered | ST "a corrected document is accepted on the next call"; confirmed in the running app, on a correction the agent made unprompted |
| UnsupportedVersionFallsBack | covered | SC `unknown-version`; UV "ignores an envelope that does not validate" |

## Summary

74 covered, 0 partial, 0 uncovered.

<!-- retired note -->
Each partial is a scenario whose subject has no code path to exercise, not a
behaviour left untested:

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

## Added after the semantics inverted

The scenarios below arrived with `set`, and the rows above cover them. Two things
worth stating separately, because they were found by looking rather than by testing:

- **Relationship roles were invisible.** Elements carried a role and relationships did
  not, so an added or retyped relationship looked exactly like one included for
  context — on an architecture proposal, where relationships are most of what changes.
  Covered by UV "distinguishes an added, a changed, and a context relationship" and
  "shows what a changed relationship changes, as a before and after".
- **The diagrams could not leave the application.** Boxes were HTML in a
  `foreignObject`, which serializes without its styling. They are native `rect` and
  `text` now, and UV "hands over markup that stands on its own" asserts the absence of
  `foreignObject`, of class attributes, and the presence of an explicit ground.

## What the shipped package does, and what is still unproven

The schema is imported rather than read from disk. That was not a tidy-up: a path
relative to the module resolves inside this repository and nowhere else, so the
filesystem read passed every test here and would have failed on the first `npx`
install. Verified by building the package, running it from an unrelated directory,
and presenting a document through it.

Still unproven, and not to be read as covered:

- **The bundled skill is not demonstrably loaded.** It is copied into the package and
  the server enumerates skill directories, but it does not appear among the commands
  the session announces — not even when `skillPaths` points directly at it. Either
  `additionalSkillPaths` does not behave as assumed in this SDK version, or skills
  supplied that way do not surface as commands. The packaging is right; the loading is
  not shown.
- **The standalone executable gets no skill.** `build-sea` produces a single file and
  does not embed the skills directory, so the filesystem lookup finds nothing there.
  It degrades rather than breaking — the tool works, its instructions are absent.
- **No MCP producer has been exercised.** The transport reads `result.details`; that a
  real MCP server's `structuredContent` arrives in that field is assumed, not tested,
  and cannot be tested from here.
- **The reference validator is not portable yet.** It needs `tsx` and this repository's
  TypeScript sources. The schema and the conformance suite do cross that boundary; the
  interface itself does not, which is half of what the requirement asks for.
