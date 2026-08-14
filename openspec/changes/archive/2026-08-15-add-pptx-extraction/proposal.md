## Why

An uploaded `.pptx` can be placed in the workspace but the agent has no dedicated way to read its
slides. Treating PowerPoint as merely another binary path reference leaves the agent guessing or
falling back to a shell command that cannot reliably recover presentation structure.

## What Changes

- Add a `pptx_extract` agent tool that reads a workspace PowerPoint file as structured markdown.
- Extract slides in presentation order, including text and declared tables, with slide numbers and
  titles suitable for requesting a focused range later.
- Apply the same sandbox confinement, archive-safety limits, size ceiling, output bounds, and
  optional whole-document/output-file behavior used by the existing Office extractors.
- Register `.pptx` as a path-extractable format so the dropped-file upload flow may safely attach
  uploaded presentations by workspace path.

## Capabilities

### New Capabilities

- `pptx-documents`: safe, bounded extraction of textual PowerPoint slide content for the agent.

### Modified Capabilities

- `file`: `.pptx` files become an agent-readable binary document type through a dedicated
  path-based extraction tool.

## Impact

- New parser and tool modules under `server/src/`, plus ZIP/XML parsing fixtures and tests.
- `server/src/config.ts` and `server/src/sandbox.ts` gain PPTX limits and tool registration.
- `ui/src/util/workspacePath.ts` recognizes `.pptx` alongside other path-extractable formats.
- `add-dropped-file-upload` can retain its declared `.pptx` routing once this change is implemented.
