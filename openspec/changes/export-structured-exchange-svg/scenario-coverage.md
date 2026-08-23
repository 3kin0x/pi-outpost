# Scenario-to-test matrix

Enumerated with `rg '^#### Scenario:' openspec/changes/export-structured-exchange-svg/specs/`
— 19 scenarios across the two delta specs. Classified by reading the assertions: a
scenario counts as `covered` only where the test would fail if its GIVEN/WHEN/THEN
contract broke, not where a test merely mentions the same subject.

Test files, by shorthand:

- **viewer** — `ui/src/components/FileViewer.structuredExchange.test.tsx`
- **seam** — `ui/src/presentations/figureSeam.test.tsx`
- **export** — `server/test/structuredExchangeFigureExport.test.ts`
- **tool** — `server/test/structuredExchangeFigureTool.test.ts`
- **document** — `server/test/structuredExchangeDocument.test.ts`
- **read** — `server/test/structured-exchange-file-read.test.mjs`
- **browser** — `server/test/fileBrowser.test.ts`
- **live** — `server/test/live/structure-figure.test.mjs` (real agent turns; not in the
  offline suite)

## `file` — StructuredExchangeDocumentsArePreviewedAsWhatTheyDescribe

| Scenario | Status | Where |
|---|---|---|
| ADocumentFileOpensAsADiagram | covered | **viewer** "is displayed as the rendering it describes" — asserts the rendering container, an `<svg>`, and a label from the document. Also driven in the running app against a real server. |
| RecognitionIsByContentNotByName | covered | **viewer** "is recognised by what it declares, not by its name" and "is drawn whatever it is called" — the same extension both ways, and a document under `.txt`. **document** "recognition is by the declaration, not by anything around it" removes only the `schema` field. |
| TheReaderKeepsTheSameControls | covered | **viewer** "keeps the narrowing and the export a reader has anywhere else" (both legend vocabularies present, download and copy offered) and "narrows by kind, from the file, and says the view is no longer whole" (drives the legend, asserts the banner). |
| TheDocumentItselfStaysReachable | covered | **viewer** "keeps the document as written one action away" — asserts the rendering is gone and the document's own text is on screen. |
| AnInvalidDocumentIsSaidToBeInvalid | covered | **viewer** "says what failed…" (banner present, non-empty, file still readable) and "names what failed, from the reference validator when the server sent it" (asserts the specific message and JSON Pointer). **read** "a document that fails the schema it declares comes back with the reasons" asserts the diagnosis crosses the socket. |
| AnUnsupportedVersionFallsBackToText | covered | **viewer** "falls back to text for a version it does not implement, without validating it" — asserts the version is named, no invalid banner, and the text is shown. **document** "a version we do not implement is named and never validated". |
| TooLargeIsNotTheSameAsInvalid | covered | **viewer** "reports a document too large to fetch as a size problem, not as an invalid one". **browser** "reports a document past its own ceiling as a size problem naming both limits" asserts the message names the limits and `doesNotMatch(/invalid/)`. |

## `structured-exchange` — AFigureLeavesAsOneFile

| Scenario | Status | Where |
|---|---|---|
| TheFigureStandsAlone | covered | **seam** "references no stylesheet, script, font file or address" (no `<script>`, `<style>`, `<image>`, `xlink:href`, `@import`, no address but the namespace, every `url()` a local `#` reference), "declares the namespace", "names the font as a family rather than fetching one". **export** "is one complete, self-contained SVG document". |
| InteractionAffordancesDoNotTravel | covered | **seam** "the browser adds hit areas and the figure has none" — asserts both halves, so a picture with no edges cannot pass it. Plus "carries no cursor, touch-action or pointer-events", "carries no style attribute at all", and "carries none of the hit areas the rendering it came from needs", which drives the reader's own download button and reads what would have been written. |
| ANarrowedFigureSaysSo | covered | **export** "a narrowed figure states how much of the document it shows" asserts the sentence is *inside the SVG*, not only in the result; "a proposal's figure says the hidden types are still proposed"; "the accessible name counts what is drawn, not what was declared". |

## `structured-exchange` — AFigureCanBeProducedWithoutABrowser

| Scenario | Status | Where |
|---|---|---|
| TheSamePictureWithoutADisplay | covered | **seam** "agrees shape for shape on a graph / a proposal / a sequence" compares tag, geometry, fill, stroke, text and document order between the React rendering and the parsed SVG; plus "agrees on the canvas" and "declares the same arrowheads". "agrees under a narrowing" drives the legend and compares the narrowed pair. |
| ProducingAFigureIsDeterministic | covered | **export** "is byte-identical for the same document and narrowing". **seam** "draws the same picture twice" and "…under a narrowing" over graph, proposal and sequence. |
| AnInvalidDocumentYieldsNoFigure | covered | **export** "an invalid document is refused with its reasons and no markup" asserts issues are present and no `svg` field came back. **tool** "an invalid document is refused with the reason, and nothing is written" asserts the file does not exist. |

## `structured-exchange` — TheAgentCanWriteAFigureToAPath

| Scenario | Status | Where |
|---|---|---|
| AFigureIsWrittenWhereTheAgentAsked | covered | **tool** "writes the figure where the agent asked" reads the file back and asserts it is an SVG drawing that document. **live** drives the same through a real agent turn. |
| TheNarrowingIsTheReadersNarrowing | covered | **tool** "the two hide lists are separate vocabularies" — the fixture puts a `power` relationship between two `compute` elements and a `power` element on a `signal` one, so each half fails independently; asserts on the written file. **export** "the two vocabularies are independent even when a name is in both" and "a relationship whose endpoint is hidden goes with it". |
| NoNarrowingMeansTheWholeDocument | covered | **tool** "no narrowing draws the whole document, and says so" asserts every label is in the written figure. **export** "no narrowing draws the whole document" asserts the coverage counts. |
| WritingOutsideTheWritableZoneIsRefused | covered | **tool** "a path outside the writable zone is refused, naming the confinement" asserts the message names the zone and *does not* name `ENOENT/EACCES/EPERM`, and that nothing was written; "makes no folder outside the writable zone"; "a read-only sandbox refuses every destination". |
| TheResultSaysHowMuchItShows | covered | **tool** "the result states how much of the document the figure shows" asserts the narrowed counts in the returned text. |
| ANarrowingThatHidesEverythingIsReportedNotDrawn | covered | **tool** "a narrowing that leaves nothing is reported, and nothing is written" asserts `isError`, the reason, and that no file exists. **export** "a narrowing that leaves nothing is reported, not drawn". |

## Summary

19 scenarios: **19 covered, 0 partial, 0 uncovered.**

Two scenarios have a second, stronger witness that does not run offline —
`AFigureIsWrittenWhereTheAgentAsked` and `TheNarrowingIsTheReadersNarrowing` are also
driven by **live**, which asserts that a real agent reaches for the tool and passes a
narrowing rather than exporting the whole document every time. That is behaviour no
offline test can see, and it is the failure this project has hit before: a mechanism that
worked perfectly when driven directly and was never used.
