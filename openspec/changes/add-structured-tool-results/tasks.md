## 1. Contract and validation

- [x] 1.1 Add the version-1 JSON Schema as a Git-tracked source file committed with the implementation
  and its tests, carrying its stable version-specific `$id` and written so it can be copied and used
  on its own, and derive the shared TypeScript types from it.
- [x] 1.2 Implement two-stage validation: schema validation, then deterministic semantic checks for
  unique element identifiers, relationship and message endpoints resolving to declared elements,
  row-to-column alignment, agreement between the declared kind and the data variant, the rule that a
  target and removals appear only on a kind that may be proposed, and the refusal of a proposal that
  both changes and removes the same reference.
- [x] 1.3 Test that neither stage repairs, completes, or guesses: unknown version, truncated document,
  near-miss endpoint identifier, arbitrary JSON, and a table carrying a target or a removal.
- [x] 1.4 Test the patch rules: a target makes the envelope a patch, an absent target makes it a new
  artifact, an addition-only proposal with no references anywhere is still a patch, and a removal
  without a target is refused.
- [x] 1.5 Test the field-level patch rules: a referenced element declaring one field changes only that
  field, a referenced element declaring nothing else is context rather than a modification, and an
  element with no reference must declare the fields a new one requires.
- [x] 1.6 Test removals: a removal names both a reference and what kind of thing it removes, a removal
  naming a kind the declared data cannot contain is refused, and a proposal that both changes and
  removes the same reference is refused rather than resolved by precedence.
- [x] 1.7 Enforce and test the size bounds: the total document bound applied before parsing, each
  collection refused one element past its cap, and each bounded string refused one character past its
  own — every diagnostic naming what was exceeded, and nothing truncated.
- [x] 1.8 Implement the two bound levels: the schema's ceiling, and an optional deployment limit at or
  below it that a limit above the ceiling cannot raise. Test that a document within the ceiling but
  past the deployment's limit is refused, and that the diagnostic reports the observed value, the
  limit applied, and which level it came from.
- [x] 1.9 Record the observed size of accepted documents so an operational limit can be calibrated
  from evidence, and test that acceptance still records it.
- [x] 1.10 Test that a relationship declares its endpoints whether or not it carries a reference, that
  declared endpoints on a referenced relationship are not treated as a change, and that re-attachment
  is expressed as a removal plus a creation.

## 2. Reference validator

- [x] 2.1 Expose the shared validator through a documented command-line interface reading a document
  from a file or standard input, emitting machine-readable diagnostics and a non-zero status on
  invalid input.
- [x] 2.2 Build a portable conformance suite — valid and invalid documents with their expected
  verdicts — runnable by a producer that is not built in this repository.
- [x] 2.3 Test that the command-line interface and the application parser reach the same verdict on
  every case in the conformance suite, semantic failures included.

## 3. Presentations

- [x] 3.1 Add the structured-exchange entry to the presentation registry, positioned so a validated
  envelope outranks any presentation that infers a shape from output while an extension's own
  rendering still wins, and verify its interaction with the rule that keeps an already-chosen
  presentation.
- [x] 3.2 Add native graph, sequence, and table views that consume validated data, preserving
  direction, message order, and column order, rendering every label and value as text, and exposing
  an accessible textual equivalent.
- [x] 3.3 Add the approval view for a proposal: additions, field-level changes, declared removals, and
  referenced-but-unchanged context distinguishable from one another, with every carried element shown
  and nothing summarised.
- [x] 3.4 Keep an approved proposal recoverable exactly as it was validated — no re-serialising,
  reordering, or normalising between approval and handover.
- [x] 3.5 Add the deterministic derived diagram export for a validated graph or sequence, labelled as
  derived, and test that it carries the same structure and that no renderer parses diagram syntax to
  recover data.
- [x] 3.6 Keep the original input and complete original output reachable from every structured view.

## 4. Producing side

- [x] 4.1 Write the skill (in the tracked `skills/` directory — `.pi/skills` and `.agents/skills` are runtime locations and are gitignored, so a skill left there is not a deliverable) that lets the agent author a valid envelope: the envelope's shape, the two
  identities and when each applies, patch semantics and explicit removals, and the instruction to
  validate through the reference interface before presenting a proposal.
- [x] 4.2 Document the companion obligation for producers: the structured payload does not reach the
  model, so a result must also carry text the agent can reason about on its own.

## 4bis. The agent as producer

Raised during implementation: the details channel is filled by a tool implementation,
not by the model, so the skill described a contract the agent had no way to reach.

- [x] 4bis.1 Add a tool the agent calls with a document it composed, validating it exactly as a received one and putting it on the channel the interface reads.
- [x] 4bis.2 Return a refusal to the agent as an error carrying the same diagnostics a producer receives, so it corrects and presents again inside the same exchange.
- [x] 4bis.3 Require a summary alongside the document, since the structured payload does not come back to the agent on a later turn.

## 4ter. Describing is not changing

Raised by review after section 5 closed: a patch often has to carry unmodified
elements so the reader can situate it, and there was no way to say so.

- [x] 4ter.1 Invert the default on a referenced element or relationship: declared fields describe what exists; a change is stated in `set`. The failure mode of a forgotten marker must be inert, not a silent rename.
- [x] 4ter.2 Refuse a change that names nothing to change, and a change that names no field.
- [x] 4ter.3 Show a change as a transition from the described value to the declared one, which the approval view could not do before.
- [x] 4ter.4 Report the role tally back to the agent, so `0 changed` is visible to a producer that cannot see the rendering.
- [x] 4ter.5 Replace the sequence list with a lifeline diagram: the native view was harder to read than the export derived from it.

## 5. Verification

- [x] 5.1 Build a scenario-to-test matrix over every delta scenario, verified at the parser and
  rendered-component boundaries.
- [x] 5.2 Drive the round trip in the running app with the agent as producer: ask it for a proposal
  through the skill, read back the DOM to confirm the approval view shows additions, changes, and
  removals, and confirm the raw output stays reachable.
- [x] 5.6 Re-exercise the running app after the interaction work landed — the key, filtering,
  dragging, panning, the full-size view, loops and parallel relationships. See "What the running app
  was actually driven through" in coverage.md for what was driven and what each run found.
- [x] 5.3 Exercise an invalid and an unknown-version envelope in the running app; confirm no
  specialized view appears and the result stays readable.
- [x] 5.4 Confirm in the running app that the agent recovers from a refusal: given diagnostics from
  the reference validator, it corrects its proposal without being told what was wrong.
- [x] 5.5 Run the focused tests, the relevant UI suites, and
  `openspec validate add-structured-tool-results --strict`.

## 6. What the reader can do with a diagram

- [x] 6.1 Carry the producer's own type on elements as well as relationships, refusing appearance —
  colour, position, size — so the document states meaning and the reader's view decides how it looks.
- [x] 6.2 Colour by type and mark change by role on channels that do not compete, so a proposal's
  additions stay unmissable without two types of the same role being drawn alike.
- [x] 6.3 Draw the key inside the figure, elements and relationships on their own lines, so an export
  explains itself.
- [x] 6.4 Let the reader narrow the view by type from the key, with element and relationship
  vocabularies kept separate, and say on screen and inside the figure what is being hidden.
- [x] 6.5 Let the reader reposition boxes and move around the diagram, without either touching the
  document.
- [x] 6.6 Draw every declared relationship perceptibly: a self-relationship with extent, parallel
  relationships apart, and long ones along the route the layout engine worked out.
- [x] 6.7 Answer the pointer the same way on every diagram, and say the same thing to a screen reader.
- [x] 6.8 Describe what a removal removes, rather than showing a reference the reader cannot resolve.

## 7. What a producer outside this repository gets

- [x] 7.1 Bundle the reference validator into one file that runs with nothing installed, and ship it
  beside the schema and the conformance suite.
- [x] 7.2 Give it exit codes that separate a non-conforming document from unreadable input and from
  input that is not JSON.
- [x] 7.3 Prove the bundled skill loads, that a user's skill of the same name wins, and that
  `noSkills` still turns it off.
