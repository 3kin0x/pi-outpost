## Context

See `proposal.md` — Why.

The conversation viewport is the `<main>` element in `ui/src/App.tsx` (~line 698). Its scroll
state is held in **a ref, not state**: `stickToBottom = useRef(true)` (App.tsx:385), recomputed
in `handleScroll` as `main.scrollHeight - main.scrollTop - main.clientHeight < 120` (App.tsx:392),
and read by the effect that follows streamed items (App.tsx:395-399). A ref was the right call
for that job — scroll fires at frame rate and the effect only needs the latest value — but a ref
change renders nothing, so it cannot drive a control's visibility on its own.

Three other facts shape the approach:

- `useConversationJump` (`ui/src/useConversationJump.ts`) receives the same ref and sets
  `stickToBottom.current = false` when the analysis panel jumps to an item. Whatever replaces or
  supplements the ref must keep that call working, or a jump gets yanked back to the bottom.
- `<main>` already sits inside `<div className="relative z-0 flex min-h-0 flex-1 flex-col">`
  (App.tsx:641), a stacking context that ends just above the `<footer>` holding the composer.
  That div is the natural positioning parent: an absolutely-positioned child of it is fixed
  relative to the viewport, not to the scrolling transcript.
- jsdom implements no layout. `scrollHeight`, `clientHeight`, and `scrollTop` are all `0`, so the
  near-bottom expression is `0 < 120` — always true. Any unit test of visibility must define
  those three properties on the real `<main>` node before firing `scroll`.

## Goals / Non-Goals

**Goals:**

- One source of truth for "is the reader near the bottom", read by both the auto-scroll effect
  and the control's visibility, so the two can never disagree (spec: `ReturnToLatestControlVisibility`).
- Keep the scroll handler allocation-free and re-render-free while the reader stays on one side
  of the threshold.
- Position the control without touching the transcript's DOM or the composer's layout.

**Non-Goals:**

- No unread-message counter, no "N new messages" badge, no jump-to-first-unread. This change
  returns to the end; counting what was missed is a separate capability.
- No change to the 120px threshold, and no configuration for it.
- No persistence: visibility is derived from the live scroll position, never stored.
- No new component library, animation library, or icon dependency.

## Decisions

### 1. Keep the ref, add state beside it, flip state only on threshold crossings

`handleScroll` keeps writing `stickToBottom.current` exactly as today, and additionally calls
`setAtBottom` — but only when the computed value differs from the ref's previous value.

```
const next = main.scrollHeight - main.scrollTop - main.clientHeight < THRESHOLD;
if (next !== stickToBottom.current) setAtBottom(next);
stickToBottom.current = next;
```

React bails out of an identical `useState` set, so an unconditional call would also be correct;
the explicit comparison makes the intent legible and avoids the bail-out check on every scroll
frame during streaming.

*Why not replace the ref with state outright?* The effect at App.tsx:395 reads the value in the
same tick it is set by a scroll during streaming; a state value read there would be one render
stale and would follow content the reader had just scrolled away from. `useConversationJump` also
writes the ref imperatively from inside an effect. The ref stays authoritative; state is a
render-visible mirror.

*Why not `useSyncExternalStore` or an IntersectionObserver on `bottomRef`?* An observer would be
the idiomatic "is the end visible" primitive, but it answers a subtly different question than the
120px threshold does, which would let the control and the auto-scroll decision disagree — the one
thing the spec forbids. Keeping a single expression keeps them in lockstep.

### 2. The jump reports, the conversation decides

`useConversationJump` used to write `stickToBottom.current = false` itself. It now takes
`onJump(target)` instead of the ref: the conversation owns both representations of the fact *and*
the scroller's geometry, and the decision needs all three.

The decision is not "the reader jumped, so stop following". Jumping to something already on screen
at the end of the conversation scrolls nothing and emits no scroll event; suppressing the follow
there strands a reader who is *at* the bottom with a transcript that no longer follows and no
control offered, the control being hidden precisely because they are at the bottom. So the target's
own box settles it: a jump is a departure when the target is off screen, or when the reader was
already away from the end.

Reading the target rather than waiting for the jump's first scroll frame also closes a window in
which a streamed item arriving mid-jump pulls the reader back to the end and cancels the navigation
they just asked for.

### 3. Anchor the control to the existing `relative z-0` wrapper

Render the button as the last child of `<div className="relative z-0 flex min-h-0 flex-1 flex-col">`
(App.tsx:641), after `</main>`, positioned `absolute bottom-4 left-1/2 -translate-x-1/2 z-10`.

*Why not inside `<main>`?* `<main>` is the scroller; a child of it scrolls with the transcript
unless made `sticky`, and `sticky` inside a flex column whose content is a centered `max-w-3xl`
div fights the existing layout. *Why not `position: fixed`?* The app also runs embedded in a host
page (`@pi-outpost/embed`, shadow root, hostile host CSS); `fixed` resolves against the host's
viewport, which is not the widget. Absolute inside a container the app owns is correct in both
shapes. `z-10` keeps it above the transcript while staying inside the `z-0` stacking context, so
it cannot rise above the header's menus.

### 4. Restore the near-bottom state on activation, and ignore the animation's own frames

The click handler scrolls `bottomRef` into view **and** sets both the ref and the state to `true`
immediately, rather than waiting for the animation to settle.

That alone is not enough, and the browser is the only place it shows: `scrollIntoView({behavior:
"smooth"})` emits a scroll event per frame, and every one but the last reports a viewport still far
from the end. Read naively they say the reader walked away — the control flickers back on for the
length of the animation (observed directly in the bench), and the transcript stops following
anything that streams in meanwhile. A `returning` guard therefore holds the last position seen while
an app-initiated scroll is in flight, and swallows those frames.

Three things release it, because none of them alone is enough:

- **Arrival** — a frame that reaches the near-bottom region.
- **Direction** — any position that moves *away* from the end. Nothing this app starts moves that
  way, so that is the reader; it is the only signal a scrollbar drag gives.
- **`scrollend`** — the backstop, and the only thing that catches a reader who drags *towards* the
  end and lets go short of it: no gesture, and every position moving the way the animation was.

The wheel, touch and key handlers on the scroller release it too, as the immediate path for the
common case.

The same guard wraps the automatic follow, for the same reason: a turn or tool card taller than the
near-bottom region starts that animation from outside it.

`prefers-reduced-motion: reduce` is read explicitly and turns the scroll into a jump — unlike a CSS
transition, `behavior: "smooth"` is not softened by the preference on its own.

### 5. Keep the control in `App.tsx`, not a new component file

It is a single button with no state of its own and one callback. A separate component would need
the same two props and add an import; the codebase keeps comparably-sized affordances inline.
Revisit only if an unread counter arrives.

### 6. Watch the geometry, and follow it rather than report it

Scroll events are not the only way the end moves out of reach: a resized window, a composer that
grew, tool cards revealed, a diagram or image that finishes laying out after its message arrived.
None of them scroll. A `ResizeObserver` on the scroller and on the transcript inside it covers them.

It must not simply re-evaluate, though. Content finishing its layout under a reader who is being
followed is the end moving, not the reader leaving — reporting the new distance there files them as
having walked away from a page they never touched, and (seen in the bench) cancels the scroll to the
bottom on load. So while the conversation is following, the observer *follows*: it scrolls to the
end. Only when it is not following does it re-evaluate, which is what takes the control away when
the end comes back within reach.

The observer is installed through a callback ref rather than by reading `mainRef` in an effect. The
embed renders nothing until its branding request settles, so an effect looking at the ref on the
first render finds null — and nothing in its dependencies changes when the real interface finally
mounts, leaving the embedded widget with no observer at all.

### 7. Test the threshold by defining layout on the real node

Unit tests (`ui/src/App.test.tsx`) must `Object.defineProperty` `scrollHeight`, `clientHeight`,
and `scrollTop` on the `<main>` element before `fireEvent.scroll`, since jsdom reports zero for
all three. A test that skips this asserts nothing: the near-bottom expression is trivially true,
so the button is never rendered and a "hidden at bottom" assertion passes for the wrong reason.
Each visibility test therefore proves *both* directions — scrolled-up shows it, scrolled-down
hides it — so a stub that never moves cannot pass.

### 8. Prove placement, stacking and animation only in a browser

`FixedAboveComposer` and `ComposerStaysUsable` are layout claims, `KeyboardActivation` needs a real
key press (jsdom dispatches no click from a keydown), and the animation frames that the guard in
decision 4 exists for are not emitted by jsdom at all. All of them get Playwright coverage against a
real scroll container.

The control also has to sit *below* the drawers that overlay the conversation. Session analysis and
the work plan are both `z-10` and are rendered above it in the tree, so an equal level lets a
control for the transcript paint over the panel covering the transcript — full width, on a narrow
viewport. It is `z-0`: still above the transcript, which is not positioned at all. Its strip carries
the same padding `<main>` takes beside an open drawer, so it centres on the conversation the reader
can see.

## Risks / Trade-offs

- **Two representations of one fact (ref + state) can drift** → every write site goes through
  `setStick`, which writes both; decision 2 removes the only site that wrote just one.
- **The `returning` guard could swallow a reader's scroll indefinitely** → three independent
  releases (decision 4), each with its own test, and it is armed only for a scroll that has further
  to travel than the near-bottom region — from inside it there is nothing to guard, and arming there
  would hold the guard for an animation that never ran.
- **The observer could fight the follow, or loop** → decision 6 splits the two cases; scrolling
  changes no box, so the callback cannot re-trigger itself. Confirmed in the bench with no
  ResizeObserver loop warnings.
- **A re-render per threshold crossing** → crossings are user-initiated and rare; the state does
  not change while scrolling within one side of the threshold, so streaming does not re-render
  `App` any more often than it does today.
- **`scrollIntoView({behavior:"smooth"})` is a no-op under some reduced-motion settings and is
  stubbed in jsdom** → activation sets the state itself (decision 4), so the observable outcome
  does not depend on the animation completing. The unit test asserts the call plus the state
  change; the browser test asserts the actual scroll position.
- **The absolute button could overlay transcript content at narrow widths** → it sits in the
  bottom gutter above the composer, centered, with the transcript's own `py-6` padding beneath
  the last item; verified in the bench at a narrow viewport rather than assumed.
- **The embed shape has a shadow root and host CSS** → decision 3 avoids `fixed` for this reason;
  the bench (`npm run bench`, host page on 4321 with hostile CSS) is where that is confirmed.

## Migration Plan

None. Additive UI with no protocol, persistence, config, or dependency change. Rollback is
reverting the commit; no state outlives it.
