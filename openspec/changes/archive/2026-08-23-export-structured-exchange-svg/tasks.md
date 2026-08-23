## 1. Extract the rendering core into `shared/`

- [x] 1.1 Move the palette, `CHAR_WIDTH`/`BOX_PADDING`/`LINE_HEIGHT`, `boxWidth`,
  `boxWidthWithChanges` and `wrapLabel` into `shared/`, with their existing unit tests moved beside
  them and still passing unchanged.
- [x] 1.2 Move the dagre layout for graphs and the position computation for sequences into
  `shared/`, taking a validated document and a narrowing and returning a computed layout — no React,
  no DOM, no imports from `ui/`.
- [x] 1.3 Compute the figure in `shared/` as a list of drawing primitives — rectangles, text runs,
  lines and paths with the attributes they are drawn with — from a validated document and a
  narrowing. `ui/` draws that list as React SVG elements and keeps pan, zoom, drag, tooltip, legend
  and the download button; nothing in `shared/` imports React.
- [x] 1.4 Move `@dagrejs/dagre` from `ui`'s dependencies to the workspace that now computes layout,
  and confirm no `ui`-only package became a `shared` dependency by accident.
- [x] 1.5 Represent the narrowing as one named type in `shared/` — the set of `element:<kind>` /
  `relationship:<kind>` keys the legend already toggles — and have `ui/` use it rather than its own
  inline set type.
- [x] 1.6 Run the UI suite unchanged. It covers the rendering today, and it is the check that the
  extraction moved code without changing pictures.

## 2. A document file is previewed as a diagram

- [x] 2.1 Recognize a structured-exchange document by parsing the file and comparing its declared
  `schema`, not by extension. Any other JSON keeps its current display.
- [x] 2.2 Render a recognized document in the full-size viewer with the existing presentation, its
  legend narrowing and its figure export.
- [x] 2.3 Keep the document as written one action away, following the raw toggle the markdown view
  already has.
- [x] 2.4 Report a file that declares the schema and fails validation as a validation failure,
  naming what failed, and leave the file readable as text.
- [x] 2.5 Fall back to text for a declared schema version the application does not support, without
  attempting a rendering.
- [x] 2.6 Give structured-exchange documents their own read ceiling, defaulting to the contract's
  operational limit, following how PDFs are measured against `config.pdf.maxBytes`; report the limit
  hit as a size problem and never as an invalid document.
- [x] 2.7 Tests: recognition by content not by name, the reader's controls present, the document
  reachable, invalid, unsupported-version and too-large each reported as themselves.

## 3. Produce a figure without a browser

- [x] 3.1 Add a serializer in `shared/` that turns the primitive list into a complete SVG document,
  for a caller with no browser.
- [x] 3.2 Strip what exists only for interaction, so a figure carries no cursor, touch-action,
  pointer handler or drag affordance.
- [x] 3.3 Carry the narrowing statement into the figure — how much of the document it shows, and for
  a proposal that hidden kinds remain part of it — as `ReaderMayAdjustAndNarrowTheView` already
  requires of the interactive export.
- [x] 3.4 Refuse to produce a figure for a document that fails validation, naming the reason and
  writing nothing.
- [x] 3.5 Seam test: the shapes the browser rendering draws for a document and a narrowing match the
  shapes in the serialized SVG for the same list — geometry, text and colour, not bytes.
- [x] 3.6 Determinism test: the same document and narrowing twice, same picture.
- [x] 3.7 Self-containment test: the figure references no stylesheet, script, font file or URL of
  the application.

## 4. The agent writes a figure to a path

- [x] 4.1 Add the tool: a path to the document, hidden element kinds, hidden relationship kinds, and
  an output path.
- [x] 4.2 Read the document through the confined read path and validate it before anything is
  produced.
- [x] 4.3 Write through the same confinement as every other agent write; refuse a path outside the
  writable zone naming the confinement, not the filesystem error.
- [x] 4.4 Map the two named lists to the internal narrowing keys, so that an element kind and a
  relationship kind sharing a name are independent.
- [x] 4.5 Treat an absent narrowing as the whole document.
- [x] 4.6 Return what was written and how much of the document it shows; report a narrowing that
  leaves nothing to draw rather than writing an empty figure and calling it success.
- [x] 4.7 Describe the tool so an agent reaches for it correctly — what the two lists mean, and that
  the figure is referenced from Markdown as a relative path.
- [x] 4.8 Tests: written where asked, independent vocabularies, no narrowing means everything,
  refusal outside the writable zone, the result's statement, and the empty-narrowing report.

## 5. Prove it in the running application

- [x] 5.1 Drive the whole workflow in a real server against a real workspace: a document file
  written to disk, opened in the viewer, narrowed by kind, and the figure exported by hand.
- [x] 5.2 Drive the agent path: ask for a figure of one domain, then another, and read back the
  written `.svg` files and the Markdown that references them.
- [x] 5.3 Open the resulting Markdown in the viewer and confirm each figure renders — the image
  decoded, not merely present — as verified for `/files/raw` SVG before this change.
- [x] 5.4 Confirm the tool is actually reached for: the agent uses the narrowing arguments rather
  than exporting the whole document every time.

## 6. Close it out

- [x] 6.1 Scenario-to-test matrix over both delta specs, classified against assertions rather than
  test names, with `rg '^#### Scenario:' openspec/changes/export-structured-exchange-svg/specs/` as
  the enumeration.
- [x] 6.2 `npm run typecheck`, `npm run lint`, server suite, UI suite, `npm run test:linux`, and
  `openspec validate export-structured-exchange-svg --strict`.
- [x] 6.3 Record anything found on the way that the specs did not anticipate.
