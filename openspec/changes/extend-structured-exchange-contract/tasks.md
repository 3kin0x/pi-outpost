## 1. Baseline and Versioned Contract

- [ ] 1.1 Confirm `add-structured-tool-results` is integrated, reconcile this change against the final version 1 schema and semantics, and freeze representative version 1 fixtures before modifying shared dispatch.
- [ ] 1.2 Define explicit schema ceilings for profiles, attribute counts and values, revisions, expectations, locations, artifact links, and the complete version 2 document.
- [ ] 1.3 Add the committed version 2 JSON Schema with its stable identifier, strict object shapes, typed non-recursive attribute values, object target, locations, expectations, and digest-bound artifact links.
- [ ] 1.4 Generate version 2 TypeScript types from the committed schema and add drift checks proving generated declarations and every distributed schema copy match their source.
- [ ] 1.5 Package both schema versions, their documentation, and their conformance data, and verify the built package from outside the repository.

## 2. Validation and Compatibility

- [ ] 2.1 Add schema-identifier dispatch that selects the version 1 or version 2 validator without changing version 1 acceptance, diagnostics, rendering selection, or fallback behavior.
- [ ] 2.2 Extend pre-parse and post-parse bounds enforcement to every version 2 string and collection, including finite-number and non-recursive-value checks.
- [ ] 2.3 Add semantic validation for proposal-only revisions and expectations, referenced-item expectations, contradictory attribute assignment/removal, duplicate removal names, and invalid location ranges.
- [ ] 2.4 Prove validation performs no network or resource retrieval for profiles, locations, or artifact links and treats every producer-controlled identifier as inert.
- [ ] 2.5 Extend validation diagnostics and accepted-size observability so a producer can identify the exact version 2 field, value, and schema or deployment limit involved.
- [ ] 2.6 Add valid and invalid version 2 conformance fixtures covering every new value variant and semantic rule, while running the frozen version 1 corpus unchanged.

## 3. Producer Interface and Guidance

- [ ] 3.1 Extend the standalone producer validation interface to validate version 2 from a file or stdin with the same schema, semantic rules, diagnostics, and exit statuses as the application.
- [ ] 3.2 Test the packaged validator in a temporary directory without source files, `tsx`, network access, or repository-relative imports.
- [ ] 3.3 Update the bundled schema documentation with complete version 2 examples for a new artifact, an unknown-profile view, and a revision-bound proposal with expectations.
- [ ] 3.4 Update bundled authoring guidance to explain profile ownership, opaque references, description versus expectation versus change, explicit attribute removal, location hints, and artifact digests.
- [ ] 3.5 Document that profile-specific validation and final concurrency checks belong to the producer or receiving authority and are not claims made by the core application.

## 4. Presentation and Approval

- [ ] 4.1 Extend the presentation model to expose profile, target revision, descriptive attributes, expectations, proposed assignments, proposed removals, locations, and artifact links without domain interpretation.
- [ ] 4.2 Render bounded attribute details generically with stable ordering and visually distinct roles for description, applicability condition, assignment, and removal.
- [ ] 4.3 Present unknown profiles, locations, and artifact metadata as escaped inert text, with explicit labels explaining that expectations are checked by the receiving authority.
- [ ] 4.4 Extend the accessible textual equivalent so it contains every enrichment available in the native presentation, including items whose detail panels are visually collapsed.
- [ ] 4.5 Preserve all version 2 fields through live transport, history restoration, approval, and recovery without normalization or replacement by a derived export.
- [ ] 4.6 Keep diagram exports structural and deterministic, and prove attributes or profile text cannot inject diagram structure or change the document recovered for handover.

## 5. Safe Navigation and Artifact Use

- [ ] 5.1 Add explicit location navigation only for schemes and workspace targets already allowed by the application's resource safety policy; leave unsupported locations visible and copyable.
- [ ] 5.2 Ensure no location or artifact resource is opened, fetched, rendered, or executed before a reader action.
- [ ] 5.3 For supported artifact retrieval, stream bytes through a bounded path, compute SHA-256 before use, and refuse opening or applying bytes whose digest does not match the validated link.
- [ ] 5.4 Test duplicate locations, stale location revisions, unsafe schemes, missing resources, oversized resources, valid digests, and digest mismatches at the real resource boundary.

## 6. Scenario Coverage and Running-App Proof

- [ ] 6.1 Add focused schema, semantic, bounds, dispatch, packaging, producer-CLI, presentation, accessibility, navigation, and recovery tests whose assertions cover every applicable scenario in `structured-exchange-context`.
- [ ] 6.2 Build an explicit scenario-to-test matrix from `rg '^#### Scenario:' openspec/`, classifying every base and delta scenario as covered, partial, or uncovered and reading each cited assertion before accepting it as coverage.
- [ ] 6.3 Run focused tests, relevant complete suites, type checking, schema/type drift checks, package smoke tests, and strict OpenSpec validation.
- [ ] 6.4 Exercise an unknown-profile version 2 document in the running application with Playwright and verify profile, typed attributes, locations, and artifact metadata through the DOM and accessible text.
- [ ] 6.5 Exercise a revision-bound proposal in the running application with Playwright and verify descriptions, expectations, assignments, removals, approval, and byte-preserving recovery through the actual transcript and handover boundary.
- [ ] 6.6 Exercise explicit safe navigation and one matching and one mismatching artifact digest in the running application, verifying observable outcomes rather than relying on screenshots.
- [ ] 6.7 Run `git diff HEAD`, invoke the required `code-reviewer` agent with the complete task diff, resolve every CRITICAL/HIGH finding, and report non-blocking findings.
