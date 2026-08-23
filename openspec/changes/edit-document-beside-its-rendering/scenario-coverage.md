# Scenario-to-test matrix

Enumerated with `rg '^#### Scenario:'
openspec/changes/edit-document-beside-its-rendering/specs/` — 8 scenarios in the one
delta spec. Classified by reading the assertions: a scenario counts as `covered` only
where the test would fail if its GIVEN/WHEN/THEN contract broke.

All tests are in `ui/src/components/FileViewer.split.test.tsx` (23 tests) unless named
otherwise. Every one of them drives the mode the way a reader reaches it — clicking
`⇹ split` — rather than setting state directly.

| Scenario | Status | Where |
|---|---|---|
| TheDocumentAndItsPictureAreShownTogether | covered | "shows the document and its picture at the same time" — asserts a textarea *and* the rendering inside the same split container, and that the rendering draws a label from the document. |
| MarkdownIsEditedBesideItsRenderingToo | covered | "shows the source and the rendering at the same time" and "renders what is in the editor, not what is on disk" (asserts the new heading, the absence of the old one, and that nothing was saved). "resolves a figure reference the same way it does at full width" is what makes the shared renderer load-bearing rather than incidental, and "never goes stale, because there is no text it cannot render" asserts the absence of a marker Markdown must never show. |
| ThePictureFollowsTheEditor | covered | "draws what is in the editor, not what is on disk" — types a valid change, asserts the new label is drawn and the old one is not, and that `onSave` was never called. The last assertion is what makes it about the *buffer* rather than about a save that happened quietly. |
| AnUnparseableMomentDoesNotEraseTheDiagram | covered | Three tests, asserting the rendering *staying* rather than an error being absent: "keeps the last good picture while the text does not parse" (and that it is the last good one, not the file's), "keeps it while the text parses and fails the schema, too", and "takes the marker away again when the text comes back". |
| WhyItDoesNotMatchIsReachable | covered | "says why the text is refused, without leaving the mode" (issue list non-empty, editor and picture both still present); "says why for text that does not parse"; "says so when the text stops declaring the schema at all"; and "prefers the reference validator's reasons only while the buffer matches the file", which asserts the server's diagnosis is dropped once the buffer diverges from disk. |
| SavingIsTheSameSaving | covered | "saves through the same path as any other edit, mtime and all" — asserts `onSave` receives the path, the edited text and the baseline mtime the editor started from, which is the guard the server uses against a file that moved underneath. |
| AReadOnlyDocumentStillPairsWithItsPicture | covered | "offers no editor outside the writable zone, and still pairs with the picture" — asserts the split container and the rendering are present, no textbox exists, and the lock is shown. |
| OtherFilesAreUnaffected | covered | "offers no side-by-side mode for a file it does not recognise" and "still offers nothing for a file with no rendering" (a `.ts` source file). Two counterparts stop these from being satisfied by never offering the mode at all: "offers it for a document that declares the contract and fails it", and "replaces the toggle it used to have rather than sitting beside it", which asserts Markdown gets the three-way control and the old two-state one is gone. |

## Beyond the scenarios

Three tests cover requirements stated in the requirement text rather than in a
scenario of their own:

- "draws nothing for a document that was already invalid when it was opened" — the
  mode starts from the file as loaded, so no stale picture is carried in.
- "asks before dropping unsaved changes on the way out of the mode" — leaving the
  mode is leaving the editor.
- "falls back to the rendering when there is no room for two panes" and "keeps the
  editor, not the layout, when the room runs out mid-edit" — the two orderings into
  the narrow fallback, which behave differently on purpose.

## Summary

8 scenarios: **8 covered, 0 partial, 0 uncovered.** 23 tests, plus both loops driven
in the running application.

A structured-exchange document: opened, edited, watched the picture follow, typed into
two different invalid states and back, saved, and read the file off the server to
confirm what landed. Then narrowed the viewport to see the fallback rather than assume
it.

A Markdown report: opened beside its rendering with both of its figures decoded in the
split pane, then edited — the heading followed the editor, the figure it references
still decoded, and no stale marker appeared, which is the thing Markdown must never
show.
