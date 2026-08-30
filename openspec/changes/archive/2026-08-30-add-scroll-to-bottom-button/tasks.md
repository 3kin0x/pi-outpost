## 1. Scroll state a render can read

- [x] 1.1 In `ui/src/App.tsx`, add an `atBottom` state beside the existing `stickToBottom` ref and update it from `handleScroll` only when the computed near-bottom value differs from the ref's previous value (design decision 1); verify by adding a unit test in `ui/src/App.test.tsx` that defines `scrollHeight`, `clientHeight`, and `scrollTop` on the `<main>` node and asserts the near-bottom expression drives a visible change in both directions — scrolled-up and scrolled-back-down.
- [x] 1.2 Extract the 120px threshold into a single named constant read by the auto-scroll effect and the visibility computation, so the two cannot diverge; verify by `rg -n '120' ui/src/App.tsx` returning no second literal for this threshold.
- [x] 1.3 Give `useConversationJump` a way to report its `stickToBottom.current = false` write to the state mirror (design decision 2), keeping the hook's existing signature additive; verify `ui/src/useConversationJump.test.tsx` still passes and add a case asserting the callback fires on a jump.

## 2. The control

- [x] 2.1 Render the return-to-latest button as the last child of the `relative z-0` wrapper at `ui/src/App.tsx:641`, after `</main>`, positioned `absolute bottom-4 left-1/2 -translate-x-1/2 z-10`, rendered only while `atBottom` is false (design decision 3); verify with unit tests covering `HiddenAtBottom`, `AppearsOnScrollUp`, `HidesOnScrollBackDown`, and `AbsentFromTreeWhenHidden` via `getByRole("button", { name: ... })` / `queryByRole`.
- [x] 2.2 Give the button an accessible name describing a return to the latest message, keyboard reachability as a native `<button type="button">`, and a `motion-reduce:` variant on any transition; verify with unit tests covering `NamedForAssistiveTech` and `KeyboardActivation` (`fireEvent.keyDown`/`click` on the focused button reaching the same handler).
- [x] 2.3 Style it to match the app's existing floating affordances in both themes and both shells; verify by reading it back in the bench (task 4.1), not by inspecting the class string.

## 3. Activation

- [x] 3.1 On activation, scroll `bottomRef` into view and set both the ref and the state to near-bottom immediately rather than waiting for the animation to settle (design decision 4); verify with unit tests covering `ScrollsToEnd` (`scrollIntoView` called on the bottom anchor) and `HidesAfterActivation` (the button is gone from the tree after the click).
- [x] 3.2 Add a unit test for `ResumesAutoScroll`: scroll up, activate the control, then append an item to `state.items` and assert the auto-scroll effect follows it.
- [x] 3.3 Add a unit test for `SendsNothing`: with a composer draft and a scrolled-up viewport, activate the control and assert the agent API's send/edit/abort mocks were not called, the item count is unchanged, and the draft still reads back from the composer.
- [x] 3.4 Add a unit test for `ScrollbackProtectionPreserved`: with the viewport outside the near-bottom region, append a streamed item and assert `scrollIntoView` was not called and the button is still present; then repeat inside the region and assert it is called and no button appears (`NoYankWhileReadingScrollback`, `FollowsWhenNearBottom`).
- [x] 3.5 Add a unit test for `NotShownWhenNothingToScroll`: geometry where `scrollHeight === clientHeight`, and assert no button is exposed.
- [x] 3.6 Add a unit test guarding the ref/state seam: jump to an item via the analysis panel, assert the control appears, then activate it and assert it disappears (design risk 1).

## 4. Prove it in a browser

- [x] 4.1 Rebuild in order — `web`, then `@pi-outpost/embed`, then `npm run build:e2e-host` — run `npm run bench`, and drive the real widget at `127.0.0.1:4323` (seeded transcript): scroll up, read back that the button is in the DOM, click it, and read back `scrollTop` at the end of the scroller and the button gone. Record what was observed; a screenshot is not a check.
- [x] 4.2 Repeat 4.1 in the embedded shell on the host page (`127.0.0.1:4321`, hostile host CSS, shadow root) and confirm the control is positioned against the widget rather than the host viewport (design decision 3).
- [x] 4.3 Add a Playwright test to `e2e/app.spec.ts` covering `FixedAboveComposer` and `ComposerStaysUsable`: in a scrolled conversation, assert the control's bounding box stays put across a further scroll and sits above the composer's box, and that clicking into the composer and typing reaches the textbox.
- [x] 4.4 Check the control at a narrow viewport in the bench and confirm it does not overlay the last transcript item (design risk 4).

## 5. Close the change

- [x] 5.1 Run `npm run test --workspace ui`, `npm run typecheck`, `npm run lint`, and `npm run test:e2e`; all green.
- [x] 5.2 Produce the scenario-to-test matrix for `openspec/changes/add-scroll-to-bottom-button/specs/conversation-scroll-navigation/spec.md` — enumerate with `rg '^#### Scenario:'`, classify each as covered/partial/uncovered, and name the test file and test title for each; every scenario must be `covered`.
- [x] 5.3 Run `openspec validate add-scroll-to-bottom-button --strict` and `npx openlore check_spec_drift`; both clean.
