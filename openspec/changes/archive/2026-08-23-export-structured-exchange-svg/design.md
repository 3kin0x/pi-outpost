## Context

See proposal.md — Why. What matters for the approach is what the rendering already is.

The diagrams are native SVG: `rect`, `text`, `line`, with colour as attributes rather than classes.
An earlier version put HTML inside `foreignObject` and was deliberately removed, because a figure
built that way loses its styling the moment it is serialized. The file that draws them says so at
the top, and that decision is what makes this change small.

Layout does not measure anything. `CHAR_WIDTH` is the constant `6.6`; `boxWidth` counts characters
and multiplies; `wrapLabel` is arithmetic on that width. There is no `measureText`, no canvas, no
`getComputedStyle` anywhere in the graph or sequence path. The two `getBoundingClientRect` calls in
the file belong to pan-and-zoom and to table column sizing — neither is layout, and neither is
exported. `@dagrejs/dagre` computes positions and runs under Node unchanged.

So a figure produced under Node is not an approximation of the browser's. It is the same
computation with the same inputs.

The narrowing is already a value: a set of keys of the form `element:<kind>` and
`relationship:<kind>`, held in component state and toggled from the legend.

## Goals / Non-Goals

**Goals:**

- One rendering implementation, reachable from a browser and from Node, with parity proven by test
  rather than asserted.
- A document that lives as a file and is read as a diagram.
- A figure the agent can write and reference, confined like every other agent write.

**Non-Goals:**

- Named views, a view selector, or anything stored in the envelope. `urn:structured-exchange:1` is
  `additionalProperties: false`; that work belongs to the pending contract version.
- Rasterization. No PNG, no PDF, no headless browser, no image dependency.
- React anywhere near the server. See the primitives decision below.
- Any change to what a producer may send, or to how a document validates.
- Export of the table presentation as a figure. A table already leaves as data (CSV, XLSX) and its
  column widths *are* measured in the browser, which the diagrams are not.

## Decisions

### The rendering core moves to `shared/`, and `ui` keeps the interaction

Alternatives: have `server/` import from `ui/`; or write a second renderer for Node.

Importing `ui/` into `server/` drags React DOM, the component tree and the build assumptions of a
browser bundle into a process that has none. A second renderer is the option that guarantees the
two pictures diverge, silently, the first time either is touched.

So the split follows what the code already is: `shared/` takes the pure half — palette, `boxWidth`,
`wrapLabel`, the dagre layout, and the components that emit `rect`/`text`/`line` for a given
computed layout. `ui/` keeps pan, zoom, drag, tooltip, the legend and the download button. `shared/`
already holds the contract, its parser and its validation, so this is where the rest of the
document's meaning already lives.

`@dagrejs/dagre` moves with it. It is not a new dependency; it changes owner.

### The figure is a list of primitives, and each side draws it its own way

**This reverses the first version of this design**, which had the components move to `shared` as
`.tsx` and the server render them with `renderToStaticMarkup`. The code argued against it. The
server's `tsconfig` carries no `jsx` and its `lib` is `ES2023` with no DOM, so JSX in `shared`
pulls `react`, `react-dom` and DOM typings into a process that has no browser — and into the
standalone executable, which is a shipped feature rather than a build detail.

So `shared` computes the figure as data: a list of drawing primitives — rectangles, text runs,
lines and paths, each with the attributes it is drawn with. `ui` maps that list to React SVG
elements and layers pan, zoom, drag and tooltip on top. `shared` also serializes the same list to
an SVG string, which is what a process with no browser uses.

The objection to a second implementation still holds, and this is not one. What could drift is
geometry, text and colour, and that is computed once, in the list. What differs between the two
sides is only "primitive to element" against "primitive to string" — mechanical, small, and
carrying no decisions of its own.

Alternative kept in view: React in `shared`. It is the shorter path if the server ever needs to
render UI for another reason. It does not today, and the cost lands on the executable.

### Parity is structural, and the test says so at the seam

With one primitive list feeding both sides, "the same figure" stops being a comparison after the
fact: the two renderings cannot disagree about what to draw, because they are handed the same
answer. What remains testable is that each side draws the list faithfully.

So the test asserts at the seam. The browser rendering, mounted, produces the same set of drawn
shapes — geometry, text and colour — as the string the serializer produces from the same list.
Not a byte comparison: attribute order, whitespace and self-closing style are free to differ, and
a byte assertion would fail on those and teach everyone to ignore it.

### The tool takes a path to the document, not the document inline

Alternative: pass the envelope as an argument.

The workflow is several analyses over one model. A path lets the model be written once and read
many times; inline means the whole document is repeated in the transcript for every figure, which
is exactly the cost the file-based workflow exists to avoid. The read is confined like every other
agent read.

Inline remains a reasonable later addition for a document that was never written down. It is not
needed for the case this change is for.

### The narrowing crosses the tool boundary as two named lists

Internally the narrowing is one set of `element:<kind>` / `relationship:<kind>` keys, and it stays
that way. At the tool boundary it is two lists — hidden element kinds, hidden relationship kinds.

An encoded key string is a format an agent gets wrong silently: `power` instead of
`relationship:power` hides nothing, produces a perfectly valid figure showing everything, and looks
like success. Two named lists cannot be confused with each other, and the spec asks for the
reader's *semantics*, not the reader's encoding. The mapping to the internal key set is one
function.

### A document file is recognized by its declared schema, and read under its own ceiling

Recognition is `schema === "urn:structured-exchange:1"` after parsing. It is a `const` in the
schema, so there is no heuristic and no extension convention to maintain — and a JSON file that is
not an exchange keeps exactly the display it has today.

`/files/raw` caps at 1 MB while the contract admits 4 MB, so a valid document can be refused by the
viewer. The precedent for this is already in the codebase: PDFs are measured against
`config.pdf.maxBytes` rather than the 1 MB everything else gets. Structured-exchange documents get
the same treatment — their own configured ceiling, defaulting to the contract's operational limit —
and the viewer reports the limit it hit rather than calling a valid document invalid.

### The reason a document failed comes from the server, not the browser

Found while implementing, not anticipated when the spec was written. `AnInvalidDocumentIsSaidToBeInvalid`
asks the viewer to say *what* failed — and the browser cannot. Its schema check is a deliberate
verdict without a diagnosis: `checkStructuredExchangeSchemaInBrowser` returns one generic issue,
because the diagnostics are about 22 KB gzipped that a reader who never opens a broken document
should not pay for. Rendered against a real file it read "does not conform to the published
structured-exchange schema", which names nothing.

The reference validator already runs where the file is read. So `file_content` carries an optional
`documentIssues`, present only when the content declares a supported schema and fails it: no round
trip, no new message, and absence keeps its meaning. The browser still decides for itself whether to
render — it has its own check — and this only supplies the reason that check does not have.

The diagnosis it produces is honest and noisy: the `oneOf` over the three data shapes reports every
branch, so one real failure arrives with five companions ("must have required properties columns,
rows"). Ranking them in the viewer would be a second opinion about which failure matters, differing
from what the command-line interface prints for the same document. Left as it is.

## Found on the way

Things the specs did not anticipate, recorded so the reasoning is not lost. The
server-side diagnosis above is the largest of them and has its own section.

**Interaction affordances were larger than "cursor and touch-action".** The spec said a
figure carries nothing that exists only for pointing, and the browser's own download
stripped exactly two style properties. The seam test found four more shapes: transparent
rectangles behind the key's swatches, which are ten pixels tall and otherwise unclickable.
Both those and the edge hit paths are now labelled `data-hit`, the seam skips them by
name, and the by-hand download removes them. The general lesson is in the label: what a
browser adds for a pointer has to be *marked* as such, or the next thing added for a
pointer travels too.

**The accessible name counted what was declared, not what was drawn.** `aria-label`
switched to its "filtered to…" form only when the element count changed — so hiding a
relationship kind, which leaves every box in place, produced a figure announcing two
relationships while drawing one. Found by reading a written file, not by a test: the name
is the whole picture to a reader who cannot see it, and nothing was asserting on it.

**A figure's folder does not exist until the first figure is written.** The tool refused
`figures/power.svg` with "the folder does not exist", which is a dead end for a sandboxed
agent — it has `write` and `edit` and no mkdir. Found by running the bench, where seeding
two figures failed on the first call. The tool now creates the directory, which grants
nothing that writing the file itself would not, since the confinement on that path has
already been checked.

**A configured document ceiling only worked in one direction.** Raised above 1 MB it let
documents through, as intended; *lowered* below it, it refused nothing, because the check
only ever applied to files that were not documents. Found by Codex review. Two fixes: the
limit is now chosen from what the file declares and applies both ways, and a configured
value above the contract's own ceiling is clamped to it — following `effectiveLimit`,
where a deployment may only be more careful than the published contract, never less.
Without the clamp the server would serve a document the browser's own byte bound then
refuses, leaving the reader with raw JSON and no explanation.

## Risks / Trade-offs

**The primitive list drifts from what the browser actually draws** → The browser path consumes the
list rather than building shapes beside it, so a primitive nobody draws is dead code the UI suite
notices, and a shape drawn from anything else is the one thing the seam test looks for.

**The extraction changes the browser rendering while moving it** → The UI suite covers the
rendering today; it runs unchanged against the extracted code, and the parity test then pins the two
implementations to each other. The extraction lands before the server renderer, so a regression
shows up against the suite that already exists rather than against new code.

**A font that is not installed where the figure is opened** → The figure names a font family and
bakes the geometry computed from `CHAR_WIDTH`. A reader without that family sees different glyphs
inside boxes whose size was already decided, so text can look loose or tight but nothing moves or
overlaps. Rasterizing to a fixed-metric format would remove even that, and costs a dependency this
change refuses.

**An agent that narrows to nothing and ships an empty picture** → The result states how much of the
document the figure shows, and a narrowing that leaves nothing to draw is reported rather than
written as a success. Specified, not left to the caller.

**A figure written into a Markdown file that is later moved** → Out of scope. The agent writes a
relative reference and the viewer resolves it against the file's own directory, which is the
behaviour Markdown readers already have.

## Migration Plan

Nothing to migrate. No schema version, no stored data, no configuration that must change. The new
ceiling for document files takes a default; a deployment that never sets it sees the contract's
operational limit.

Order of work is load-bearing rather than convenient: extract, then preview, then produce, then the
tool. The preview lands before the server renderer so that the narrowing semantics are observable on
screen before anything else is built on them.
