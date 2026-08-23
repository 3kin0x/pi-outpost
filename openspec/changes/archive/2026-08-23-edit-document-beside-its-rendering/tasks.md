## 1. One mode, one source of text

- [x] 1.1 Replace the viewer's source/rendered boolean with a single display mode —
  source, rendered, side-by-side — so a state that means nothing cannot be represented.
  Offer the third only for a file recognised as a structured-exchange document.
- [x] 1.2 Drive the rendering from the edit buffer when there is one and from the loaded
  file when there is not, so there is one text and not two kept in step.
- [x] 1.3 Recompute the verdict on a debounce rather than on every keystroke, and keep
  the previous picture on screen while the next one is computed.

## 2. A picture that survives being typed at

- [x] 2.1 Hold the last envelope that validated, and keep drawing it when the editor's
  text does not parse or does not validate.
- [x] 2.2 Mark that picture as no longer matching the editor, visibly enough to be seen
  without being looked for.
- [x] 2.3 Make the reason reachable without leaving the mode — the reference validator's
  diagnosis where one travelled with the file, the browser's own verdict otherwise.
- [x] 2.4 Start the mode from the file as loaded, so a document that is invalid before
  anything is typed shows its reason and no stale picture from another file.

## 3. Editing is the editing that already exists

- [x] 3.1 Save, the mtime conflict guard, the discard confirmation and the writable-zone
  rules go through the same path as an edit made in any other mode — no second writer.
- [x] 3.2 A recognised document outside the writable zone still pairs with its rendering,
  with no edit offered.
- [x] 3.3 Leaving the mode with unsaved changes behaves as leaving the editor does today.

## 4. The layout

- [x] 4.1 Two panes that each scroll on their own: a long document must not scroll the
  diagram out of view, and a wide diagram must not widen the editor.
- [x] 4.2 Below a width at which two panes are both unusable, fall back to the toggle
  this mode extends rather than rendering two unusable halves.

## 5. Tests

- [x] 5.1 The picture follows the editor: type valid changes, save nothing, assert the
  rendering shows what was typed and not what is on disk.
- [x] 5.2 An unparseable moment keeps the last good picture and marks it stale — asserted
  on the rendering, not on the absence of an error.
- [x] 5.3 The reason for an invalid buffer is reachable in the mode.
- [x] 5.4 A document invalid on open shows its reason and draws no picture.
- [x] 5.5 Saving from this mode writes exactly as the other modes do, conflict guard
  included.
- [x] 5.6 A read-only document pairs with its rendering and offers no edit.
- [x] 5.7 An unrecognised file is offered no side-by-side mode.

## 6. Prove it in the running application

- [x] 6.1 Drive the whole loop in the running widget: open a document, edit the JSON,
  watch the picture follow, type it into an invalid state and back, save, and confirm
  what landed on disk.
- [x] 6.2 Do it once in a narrow pane, to see the fallback rather than to assume it.

## 8. Markdown gets the same mode

- [x] 8.1 Extend the mode to Markdown: the same three-way control, replacing the
  source/rendered toggle it has today, so a file with a rendering is looked at the same
  way whatever kind it is.
- [x] 8.2 Drive its rendering from the editor on the same debounce, and keep the one
  Markdown renderer — relative links and images resolve as they do in the full-width
  view, or a figure referenced from a report stops loading in half the modes.
- [x] 8.3 No stale marker and no issue list for Markdown: every text is a rendering of
  something, so there is no invalid state to report.
- [x] 8.4 Tests: source and rendering together, the rendering following the editor, a
  relative image still resolving, and a file with no rendering still offered nothing.
- [x] 8.5 Drive it in the running application.

## 7. Close it out

- [x] 7.1 Scenario-to-test matrix over the delta spec, classified against assertions
  rather than test names, with `rg '^#### Scenario:'
  openspec/changes/edit-document-beside-its-rendering/specs/` as the enumeration.
- [x] 7.2 `npm run typecheck`, `npm run lint`, the UI suite, and
  `openspec validate edit-document-beside-its-rendering --strict`.
- [x] 7.3 Record anything found on the way that the specs did not anticipate.
