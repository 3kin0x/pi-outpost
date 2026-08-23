## Context

See proposal.md — Why. What matters technically is what `export-structured-exchange-svg`
leaves behind: the viewer already recognises a structured-exchange document by its
declared schema, `readStructuredExchangeFile` turns text into a verdict (valid, invalid,
unsupported version, not a document), and `StructuredExchangeDocument` renders a
*validated envelope* handed to it as a prop. The rendering does not read a file; it takes
an envelope. So the picture can be driven by any text, including text nobody has saved.

The viewer's editing machinery is equally settled and is not the interesting part: an
`EditState` holds the draft against the baseline it started from, saves go through
`write_file` with the mtime the file had when editing began, and the reducer refetches on
`file_changed`. This change adds a way to *look* while that happens.

## Goals / Non-Goals

**Goals:**
- One layout in which the text and the picture are both in view, driven by one buffer.
- A picture that stays useful while the text is being typed — which means most of the
  time it is being shown against text that does not parse.
- No second editing path: the same save, the same conflict guard, the same rules.

**Non-Goals:**
- Editing the *picture* to change the text. Dragging a box already moves it for reading;
  making that write JSON is a different feature with its own questions.
- Any agent involvement, proposal, approval or apply step. The loop this serves is manual.
- A layout for anything other than a recognised structured-exchange document.

## Decisions

### The rendering is driven by the draft, and the draft alone

The mode has one source of text: the edit buffer when there is one, the loaded file when
there is not. Not two states kept in step — a "preview text" beside a "draft" is a second
copy that will drift, and the bug it produces is a picture of something nobody typed.

Alternative considered: re-render only on save. Rejected because it is what already
exists (save, watch it redraw) and is precisely the round trip this change removes.

### An invalid moment keeps the last good picture

Text under revision is unparseable for most of the keystrokes that produce it: every
`{`, every half-typed string. Replacing the diagram with an error on each one makes the
mode unusable and, worse, hides the thing being edited *toward*.

So the mode holds the last envelope that validated and keeps drawing it, with a marker
saying it no longer matches the editor. The reason is available on demand, from the same
verdict the viewer already computes — the reference validator's diagnosis where the
server sent one, the browser's own verdict otherwise.

Alternative considered: a hidden diagram while invalid. Rejected: an empty half of the
screen is a worse answer than a slightly stale picture, and it flickers.

Alternative considered: validating only on a pause of some seconds. That is a debounce,
which this needs anyway, but it does not remove the problem — a pause mid-edit is still
frequently invalid.

### Recompute on a debounce, not on every keystroke

Validation plus layout is arithmetic over the whole document. Cheap for a small model,
not free for a large one, and running it per keystroke turns typing into work. A short
debounce (order of 200-300 ms) is the whole mechanism; the exact number is a tuning
detail to settle against a real document rather than a contract.

### The mode is a third value, not a second boolean

The viewer has a source/rendered toggle today. Adding "split" as a second flag beside it
produces states that mean nothing (`raw && split`). One mode value — source, rendered,
split — is what the display actually is, and it makes the illegal states unrepresentable
rather than merely unreached.

## Risks / Trade-offs

**A stale picture is mistaken for a current one** → The marker is not decoration; it is
the only thing separating "this is your model" from "this was your model a moment ago".
It has to be visible without being read for, and the scenario asserting it is the one to
get right.

**The split is unusable in a narrow pane** → The viewer overlays the chat column, which
is not always wide. Below a threshold the mode should fall back to the toggle it extends
rather than render two unusable halves.

**A large document makes typing feel heavy** → The debounce bounds how often the work
runs, not how long it takes. If a real model is slow enough to notice, the answer is to
keep the previous picture while the next is computed — the same mechanism the invalid
case already needs — rather than to make the debounce longer.

## Open Questions

- Whether the side-by-side mode should be remembered per session rather than chosen each
  time a document is opened. It changes no requirement and no task; it is a preference
  that can be added later if reaching for it every time becomes the annoyance.
