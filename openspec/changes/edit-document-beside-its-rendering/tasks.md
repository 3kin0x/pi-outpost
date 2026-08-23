## 1. One mode, one source of text

- [ ] 1.1 Replace the viewer's source/rendered boolean with a single display mode —
  source, rendered, side-by-side — so a state that means nothing cannot be represented.
  Offer the third only for a file recognised as a structured-exchange document.
- [ ] 1.2 Drive the rendering from the edit buffer when there is one and from the loaded
  file when there is not, so there is one text and not two kept in step.
- [ ] 1.3 Recompute the verdict on a debounce rather than on every keystroke, and keep
  the previous picture on screen while the next one is computed.

## 2. A picture that survives being typed at

- [ ] 2.1 Hold the last envelope that validated, and keep drawing it when the editor's
  text does not parse or does not validate.
- [ ] 2.2 Mark that picture as no longer matching the editor, visibly enough to be seen
  without being looked for.
- [ ] 2.3 Make the reason reachable without leaving the mode — the reference validator's
  diagnosis where one travelled with the file, the browser's own verdict otherwise.
- [ ] 2.4 Start the mode from the file as loaded, so a document that is invalid before
  anything is typed shows its reason and no stale picture from another file.

## 3. Editing is the editing that already exists

- [ ] 3.1 Save, the mtime conflict guard, the discard confirmation and the writable-zone
  rules go through the same path as an edit made in any other mode — no second writer.
- [ ] 3.2 A recognised document outside the writable zone still pairs with its rendering,
  with no edit offered.
- [ ] 3.3 Leaving the mode with unsaved changes behaves as leaving the editor does today.

## 4. The layout

- [ ] 4.1 Two panes that each scroll on their own: a long document must not scroll the
  diagram out of view, and a wide diagram must not widen the editor.
- [ ] 4.2 Below a width at which two panes are both unusable, fall back to the toggle
  this mode extends rather than rendering two unusable halves.

## 5. Tests

- [ ] 5.1 The picture follows the editor: type valid changes, save nothing, assert the
  rendering shows what was typed and not what is on disk.
- [ ] 5.2 An unparseable moment keeps the last good picture and marks it stale — asserted
  on the rendering, not on the absence of an error.
- [ ] 5.3 The reason for an invalid buffer is reachable in the mode.
- [ ] 5.4 A document invalid on open shows its reason and draws no picture.
- [ ] 5.5 Saving from this mode writes exactly as the other modes do, conflict guard
  included.
- [ ] 5.6 A read-only document pairs with its rendering and offers no edit.
- [ ] 5.7 An unrecognised file is offered no side-by-side mode.

## 6. Prove it in the running application

- [ ] 6.1 Drive the whole loop in the running widget: open a document, edit the JSON,
  watch the picture follow, type it into an invalid state and back, save, and confirm
  what landed on disk.
- [ ] 6.2 Do it once in a narrow pane, to see the fallback rather than to assume it.

## 7. Close it out

- [ ] 7.1 Scenario-to-test matrix over the delta spec, classified against assertions
  rather than test names, with `rg '^#### Scenario:'
  openspec/changes/edit-document-beside-its-rendering/specs/` as the enumeration.
- [ ] 7.2 `npm run typecheck`, `npm run lint`, the UI suite, and
  `openspec validate edit-document-beside-its-rendering --strict`.
- [ ] 7.3 Record anything found on the way that the specs did not anticipate.
