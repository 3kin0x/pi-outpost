## ADDED Requirements

### Requirement: ADocumentCanBeEditedBesideItsRendering

The full-size viewer SHALL offer, for a file it can render — a structured-exchange
document or Markdown — a mode in which the file as written and the rendering it
describes are shown at the same time rather than one in place of the other.

The rendering SHALL follow the text being edited, not the text last saved: while the
editor holds unsaved changes, the picture is of what is in the editor. A reader who has
saved nothing has still changed the model in front of them, and a picture of the file on
disk would be a picture of a document that no longer exists in the session.

A structured-exchange document that does not parse or does not validate SHALL NOT
replace the rendering with an error. Text under revision is unparseable for most of the time someone is typing in
it, and a diagram that disappears on every keystroke is worse than one that is briefly
out of date. The last rendering that was good SHALL remain, marked as no longer matching
the editor, and the reason it does not match SHALL be available without leaving the mode.

Editing in this mode SHALL be the same editing as anywhere else in the viewer: the same
writable-zone rules, the same save, the same conflict guard when the file moved
underneath, and the same confirmation before unsaved changes are discarded. A file
outside the writable zone SHALL still be readable beside its rendering, with no edit
offered.

The mode SHALL be reachable only for a file the viewer can render. A file with no
rendering — source code, or JSON that declares no schema — keeps the display it has.

Markdown has no invalid state: every text is a rendering of something, so its half of
the view follows the editor without ever going stale.

#### Scenario: TheDocumentAndItsPictureAreShownTogether
- **WHEN** a recognised structured-exchange document is opened and the side-by-side mode is chosen
- **THEN** the document as written and the rendering it describes are both visible at once

#### Scenario: MarkdownIsEditedBesideItsRenderingToo
- **WHEN** a Markdown file is opened and the side-by-side mode is chosen
- **THEN** its source and its rendered form are both visible at once, and the rendering follows what is typed

#### Scenario: ThePictureFollowsTheEditor
- **GIVEN** a document open in the side-by-side mode
- **WHEN** the text is changed to something valid and nothing is saved
- **THEN** the rendering shows the changed document, not the file on disk

#### Scenario: AnUnparseableMomentDoesNotEraseTheDiagram
- **GIVEN** a rendering of the document as it last stood
- **WHEN** the text is edited into something that does not parse or does not validate
- **THEN** that rendering remains, marked as no longer matching the editor

#### Scenario: WhyItDoesNotMatchIsReachable
- **GIVEN** an editor whose text does not satisfy the schema it declares
- **WHEN** the reader asks what is wrong
- **THEN** the reason is available without leaving the mode

#### Scenario: SavingIsTheSameSaving
- **WHEN** a document edited in the side-by-side mode is saved
- **THEN** it is written exactly as an edit made anywhere else in the viewer, including the guard against a file that changed on disk

#### Scenario: AReadOnlyDocumentStillPairsWithItsPicture
- **WHEN** a recognised document outside the writable zone is opened in the side-by-side mode
- **THEN** it is shown beside its rendering and no edit is offered

#### Scenario: OtherFilesAreUnaffected
- **WHEN** a file the viewer has no rendering for is opened
- **THEN** no side-by-side mode is offered and the file keeps the display it has today
