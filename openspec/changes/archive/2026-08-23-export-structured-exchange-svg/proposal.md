## Why

A structured exchange can only be seen where it was produced. It arrives as a tool result in a
transcript, it is rendered there, and that is the end of it: a reader can narrow the diagram by kind
and download the figure, but only by hand, and only from that one place in the conversation.

The work this blocks is ordinary. Ask for an analysis of an architecture by domain — electrical
power, then thermal — and each chapter wants the same model drawn twice, narrowed differently. The
agent can write the prose. It cannot draw the picture, because the figure exists only as DOM inside
a browser it does not have, and it cannot re-open the model later, because the model was never a
file.

Two consequences follow, and neither needs a contract change to fix.

## What Changes

- A structured-exchange document stored as a file in the workspace SHALL be displayed by the
  full-size viewer as the rendering it describes, with the same narrowing and export controls the
  transcript offers, and with the raw JSON one toggle away.
- The figure export SHALL be specified. Today a rendering can be downloaded as SVG and no
  requirement says so, so nothing constrains what the file contains or whether a second producer of
  the same figure agrees with the first.
- The same figure SHALL be producible without a browser, from a validated document and a narrowing,
  so that a tool can write it to disk.
- The agent SHALL be given that tool: a document, a narrowing, an output path, and an `.svg` on
  disk it can reference from a Markdown file.
- The narrowing SHALL be exactly the one a reader already applies — hidden kinds, element and
  relationship vocabularies independent — and a narrowed export SHALL keep saying how much of the
  document it shows, as `ANarrowedProposalStillSaysWhatItProposes` already requires of the
  interactive one.
- **No envelope change.** `urn:structured-exchange:1` is `additionalProperties: false`, so a named
  `views` array cannot be added to it without a new schema version. The narrowing travels as an
  argument, not as document content. Named views remain available to
  `extend-structured-exchange-contract`, which is where a new version is already planned.

## Capabilities

### New Capabilities

None. Both halves extend capabilities that already exist.

### Modified Capabilities

- `structured-exchange`: exporting a rendering as a figure becomes a stated requirement rather than
  an unspecified button; the same figure becomes producible outside a browser; and the agent gains a
  tool that writes one to a path.
- `file`: the full-size viewer gains a rendering for a structured-exchange document file, alongside
  markdown, images and PDFs.

## Impact

- **Rendering code moves.** The layout and the SVG components live in `ui/`; producing a figure
  under Node needs them reachable from `server/`. The shared half moves to `shared/`, which already
  holds the contract, its parser and its validation. This is the bulk of the work and the main risk:
  the browser rendering must not change while it is being extracted.
- `@dagrejs/dagre` becomes a dependency of the workspace that computes layout rather than of `ui`
  alone. It runs under Node today; no new dependency is introduced.
- Figures are rendered server-side with `react-dom/server`. No headless browser, no rasterizer.
- `server/src/`: one new tool, registered alongside the existing document tools.
- `ui/src/components/FileViewer.tsx`: one more branch, following the markdown/PDF pattern already
  there.
- Reading a document file goes through `/files/raw`, which caps at 1 MB, while the contract admits
  4 MB. A valid document can therefore be refused by the viewer. The change must decide this
  deliberately rather than discover it.
- No schema change, no new schema version, no change to what a producer may send.
