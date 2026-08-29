# Multi-project selector — settled design

Visual source for the project selector introduced by the `add-multi-project-workspaces`
change. Kept so that whoever implements it — most likely an agent, in a later session —
can see what was decided instead of re-deriving it.

**These files are not normative.** The binding statements live in
`openspec/specs/multi-project-workspaces/spec.md` (behaviour) and the change's `design.md`
(the decisions and why they beat their alternatives). These artboards show what those
decisions look like. They will drift from the code after the first iteration; when they
disagree with the spec, the spec wins.

## What each file shows

| File | What it settles |
|------|-----------------|
| `Main.dc.html` | The menu open, in the app shell: one row per open project, full name, path in mono, state in words. |
| `HeaderClosed.dc.html` | The button's four closed appearances — everything it can say without being opened, including the muted dots for other open projects. |
| `States.dc.html` | The five workspace states as menu rows, light and dark, with their marks. Shape distinguishes as much as colour. |
| `Attention.dc.html` | The three attention levels: badge alone, badge plus browser notification, and the modal that must never happen. |
| `Switch.dc.html` | What the eye sees during a switch — what holds still, what cross-fades, what is forgotten, what keeps running behind. |
| `canvas.json` | Layout, pages, and the sticky notes carrying the rationale. |

## Values these were drawn against

Lifted from the real app, not invented — `web/src/index.css` and
`ui/src/components/Header.tsx`:

- Inter; `--accent` `#1d4ed8` light, `#60a5fa` dark; zinc palette
- Header: `gap-3 px-4 py-2.5`, bottom border `zinc-200` / `zinc-800`
- Buttons: `rounded-md border px-2 py-1 text-xs` (6 px radius, 8×4 padding, 12 px text)
- Connection dot: 8 px, `emerald-500` / `red-500`

New UI extends that vocabulary; it does not introduce a second one.

## Opening them

Each `.dc.html` is a standalone Design Component. They were authored as one pan/zoom
canvas through the `design` skill — re-seeding from these files plus `canvas.json`
reproduces it. A single file also opens in a browser on its own, minus the canvas chrome.

The canvas published during the design session lives at
<https://claude.ai/code/artifact/f82a38a2-5e79-40e4-a926-b91863460aa8> — a private
artifact, readable only by its owner, which is why these sources are here.
