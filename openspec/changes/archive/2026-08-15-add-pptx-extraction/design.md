## Context

See proposal.md — Why. DOCX and XLSX already establish the local Office-archive reader pattern:
an archive parser emits bounded markdown and a thin agent tool owns path confinement, configured
file limits, and optional output-file handling. PowerPoint is also an OOXML ZIP package, but its
reading order comes from `ppt/presentation.xml` and the slide relationship table rather than from
the lexical order of `ppt/slides/slide*.xml` names.

## Goals / Non-Goals

**Goals:**

- Expose one `pptx_extract` read tool with slide-range, `full`, and `output_path` controls matching
  the other document extractors.
- Extract text shapes and DrawingML tables in declared slide order, retaining slide numbers.
- Reuse existing bounded ZIP/XML reading and writable-destination primitives where their contracts
  apply.

**Non-Goals:**

- Rendering slides, OCR, extracting image alt text, speaker notes, charts, SmartArt, animations,
  comments, embedded objects, themes, or layout geometry.
- Editing or converting presentations, following external links, or evaluating embedded content.
- Reading legacy binary `.ppt` files.

## Decisions

**Follow the presentation relationship graph, not filenames.** The parser reads the slide-id list
from `ppt/presentation.xml`, resolves each relationship through
`ppt/_rels/presentation.xml.rels`, then reads those targets in that order. File numbering is an
implementation convention, not the order a presenter sees. *Alternative considered:* sort
`ppt/slides/slide*.xml`; rejected because reordered and irregularly named slide parts would return
the wrong sequence.

**Treat a slide as an ordered stream of extractable shapes.** Text paragraphs from `p:sp` shapes
and rows from `a:tbl` tables are emitted in the `p:spTree` child order. A title is identified from
its declared placeholder type where available; it is still included as normal slide text so title
identification never drops content. *Alternative considered:* infer a title from the first or
largest text box; rejected because geometry and typography are presentation concerns, not a stable
semantic contract.

**Share the Office safety envelope.** Use the existing ZIP entry-count, inflated-byte, and timeout
budget pattern, while introducing PPTX-specific parser errors and a 25 MiB configured file ceiling.
The tool checks the file size before loading it and keeps normal output capped by slides and
characters. *Alternative considered:* rely on the archive library defaults; rejected because a
PPTX can be a compression bomb just as a DOCX/XLSX can.

**Keep parser and tool separate.** `pptx.ts` accepts bytes and returns extraction metadata;
`pptxTool.ts` supplies sandbox roots, configuration, and `output_path` support. This permits fixture
tests of XML/ZIP behavior without an agent runtime and preserves the established Office-tool
boundary.

**Add PPTX to path-extraction inventory only when the server registers the tool.**
`hasPathExtractionTool` becomes the single UI inventory for `.docx`, `.xlsx`, and `.pptx`; the
upload change may then route a presentation to `@uploads/...` without inventing a promise the
agent cannot fulfill.

## Risks / Trade-offs

- Relationship targets can use traversal-like references → normalize each target within the PPTX
  package and refuse paths outside `ppt/` before reading an entry.
- Presentations vary widely in shape markup → return only standard text shapes and tables, and name
  unsupported visual-only content rather than silently pretending it was read.
- XML entity expansion can consume disproportionate resources → use the project’s non-networking,
  bounded XML/ZIP pipeline and enforce the parsing deadline.
- Whole-presentation output can exceed context limits → `output_path` writes the complete result,
  while direct output remains bounded and tells the agent what slide range remains.

## Migration Plan

The tool and `pptx.maxBytes` configuration are additive. Existing configurations receive the
default 25 MiB ceiling. Rollback removes tool registration; presentation files and uploaded path
references remain ordinary workspace files.
