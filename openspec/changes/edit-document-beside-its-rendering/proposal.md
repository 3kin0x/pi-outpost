## Why

A structured-exchange document is a file an engineer edits by hand. The viewer can
already show it as JSON *or* as the diagram it describes, and switching between them
is one click — but revising a model means reading the picture and changing the text in
the same motion, and a toggle makes that a sequence of round trips: type, switch, look,
switch back, having lost your place in the JSON.

The manual loop this serves is: the engineer revises the document, sees the picture
follow, and then points the agent at the revised document. Only the middle step is
missing.

## What Changes

- The full-size file viewer gains a third mode for a recognized structured-exchange
  document: the editor and the rendering side by side, instead of one or the other.
- The rendering follows what is typed rather than what was last saved, so the picture is
  of the document in the editor.
- A document that is momentarily unparseable mid-keystroke — which is most of the time
  while someone types — keeps the last picture that was good, marked as no longer
  current, rather than replacing the diagram with an error.
- Saving, the mtime conflict guard and the writable-zone rules are unchanged: this adds a
  way to look at a document while editing it, not a second way to write one.

## Capabilities

### New Capabilities

<!-- None: this extends the file viewer, whose requirements already live in `file`. -->

### Modified Capabilities

- `file`: the full-size viewer gains a side-by-side mode for structured-exchange
  documents, and a rendering that follows the edit buffer rather than the saved file.

## Impact

- `ui/src/components/FileViewer.tsx` — the mode control and the split layout.
- `ui/src/presentations/StructuredExchangeView.tsx` — the rendering is already a
  component taking a validated envelope; what changes is where the envelope comes from.
- Depends on `export-structured-exchange-svg`, which is what recognises a
  structured-exchange document by its declared schema and renders it in the viewer. That
  change must land first; this one adds a mode to what it built.
- No server change, no protocol change, no new dependency.
