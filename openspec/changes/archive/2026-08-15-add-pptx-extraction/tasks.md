## 1. PPTX parser

- [x] 1.1 Add a bounded OOXML presentation reader in `server/src/pptx.ts`, reusing the established
  ZIP/XML safety limits and producing typed PPTX-specific errors.
- [x] 1.2 Resolve slide order from `ppt/presentation.xml` and its relationship map, rejecting
  malformed or package-escaping relationship targets.
- [x] 1.3 Extract text shapes and DrawingML tables into slide-numbered markdown in declared shape
  order; escape table content and distinguish visual-only or empty slides.
- [x] 1.4 Implement slide-range parsing, normal output caps, full extraction, and clear truncation
  metadata.
- [x] 1.5 Add parser fixtures and tests for ordered slides, selected ranges, tables, no extractable
  text, corrupt/non-PPTX input, encrypted files, oversized/decompression-bomb archives, and timeout.

## 2. Agent tool and configuration

- [x] 2.1 Add `pptx.maxBytes` and `DEFAULT_PPTX_MAX_BYTES` (25 MiB) to the configuration schema,
  defaults, validation, and configuration tests.
- [x] 2.2 Add `server/src/pptxTool.ts`, mirroring document-tool confinement, pre-parse size checks,
  and `full`/`output_path` behavior; expose it as `pptx_extract`.
- [x] 2.3 Register the tool in sandboxed and non-sandboxed agent tool construction, with the same
  read exceptions and writable-output restrictions as PDF/DOCX/XLSX.
- [x] 2.4 Test tool behavior at the real boundary: path confinement including symlinks, read-only
  extraction, disabled/outside/existing output destinations, error messages, and prompt guidance.

## 3. UI inventory and upload integration

- [x] 3.1 Extend `hasPathExtractionTool` and its tests to identify `.pptx` case-insensitively.
- [x] 3.2 Reconcile `add-dropped-file-upload` so its classification and upload scenarios rely on
  the implemented PPTX tool rather than an assumed capability.

## 4. Verify

- [x] 4.1 Enumerate every `#### Scenario:` in this change’s delta specs and create a
  scenario-to-test matrix, verifying assertion strength rather than test names alone.
- [x] 4.2 Run focused parser, tool, configuration, sandbox, and UI tests; then run the relevant
  server and UI suites and `openspec validate add-pptx-extraction --strict`.
- [x] 4.3 Exercise `pptx_extract` in the running app on a real presentation and verify the session
  transcript contains ordered slide content; verify a dropped `.pptx` is uploaded and referenced
  only after both this change and `add-dropped-file-upload` are applied.
