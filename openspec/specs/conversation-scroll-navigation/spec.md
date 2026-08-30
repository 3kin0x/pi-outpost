# Conversation Scroll Navigation Specification

## Purpose

Gives a reader who has moved up through the conversation a direct way back to the newest
message, without disturbing the scrollback protection that keeps streamed output from
yanking the viewport away while they read.

## Requirements

### Requirement: ReturnToLatestControlVisibility

The conversation SHALL show a floating return-to-latest control whenever the reader's scroll
position is outside the conversation's near-bottom region, and SHALL hide it whenever the
position is inside that region. The near-bottom region is the same one that governs
auto-scroll during streaming: the control's visibility and the auto-scroll decision SHALL
never disagree.

The control SHALL be evaluated against the live scroll position, so it appears without any
further reader action once the position leaves the near-bottom region, and disappears once
the position re-enters it — whether the position changed because the reader scrolled, because
the control was activated, or because content was appended below.

#### Scenario: HiddenAtBottom
- **GIVEN** a conversation whose scroll position is inside the near-bottom region
- **WHEN** the conversation is displayed
- **THEN** no return-to-latest control is present

#### Scenario: AppearsOnScrollUp
- **GIVEN** a conversation long enough to scroll
- **WHEN** the reader scrolls up so the position leaves the near-bottom region
- **THEN** the return-to-latest control becomes visible

#### Scenario: HidesOnScrollBackDown
- **GIVEN** the return-to-latest control is visible
- **WHEN** the reader scrolls back down into the near-bottom region
- **THEN** the control is no longer present

#### Scenario: NotShownWhenNothingToScroll
- **GIVEN** a conversation shorter than the viewport, so there is no scrollback
- **WHEN** the conversation is displayed
- **THEN** no return-to-latest control is present

### Requirement: ReturnToLatestActivation

Activating the control SHALL scroll the conversation to the end of the current transcript and
SHALL restore the near-bottom state, so that subsequent streamed content resumes auto-scrolling.
Activation SHALL change nothing else: it SHALL NOT send, edit, retry, delete, or reorder any
conversation content, SHALL NOT alter the composer draft or attachments, and SHALL NOT change
which session, project, or file is open.

#### Scenario: ScrollsToEnd
- **GIVEN** the reader is scrolled up and the control is visible
- **WHEN** the control is activated
- **THEN** the conversation scrolls to the end of the transcript

#### Scenario: HidesAfterActivation
- **GIVEN** the reader is scrolled up and the control is visible
- **WHEN** the control is activated and the scroll reaches the end
- **THEN** the control is no longer present

#### Scenario: ResumesAutoScroll
- **GIVEN** the reader activated the control and is back at the end
- **WHEN** new streamed content is appended
- **THEN** the conversation follows that content, as it does for a reader who never scrolled up

#### Scenario: SendsNothing
- **GIVEN** a conversation with a draft in the composer and a scrolled-up viewport
- **WHEN** the control is activated
- **THEN** no message is sent, no item is added or removed from the conversation, and the draft is unchanged

### Requirement: ReturnToLatestAccessibility

The control SHALL be a button reachable by keyboard, activable with the standard activation
keys, and SHALL carry an accessible name describing its action. It SHALL NOT trap focus, and
SHALL NOT be present in the accessibility tree while the reader is in the near-bottom region.
Its motion SHALL respect a reduced-motion preference.

#### Scenario: NamedForAssistiveTech
- **GIVEN** the control is visible
- **WHEN** the accessibility tree is inspected
- **THEN** the control is exposed as a button with a name describing a return to the latest message

#### Scenario: KeyboardActivation
- **GIVEN** the control is visible and focused
- **WHEN** the reader presses Enter or Space
- **THEN** the conversation scrolls to the end, as if the control had been clicked

#### Scenario: AbsentFromTreeWhenHidden
- **GIVEN** the reader is inside the near-bottom region
- **WHEN** the accessibility tree is inspected
- **THEN** no return-to-latest button is exposed

#### Scenario: ReducedMotionJumps
- **GIVEN** the reader's system asks for reduced motion
- **WHEN** the control is activated
- **THEN** the conversation arrives at the end without an animated scroll

### Requirement: ScrollbackProtectionPreserved

Introducing the control SHALL NOT change the existing behavior that new streamed content
auto-scrolls the conversation only while the reader is inside the near-bottom region. A reader
who is scrolled up SHALL keep their position while content streams below, whether or not the
control is used.

#### Scenario: NoYankWhileReadingScrollback
- **GIVEN** the reader is scrolled up, outside the near-bottom region
- **WHEN** the agent streams new content
- **THEN** the scroll position is unchanged and the control remains visible

#### Scenario: FollowsWhenNearBottom
- **GIVEN** the reader is inside the near-bottom region
- **WHEN** the agent streams new content
- **THEN** the conversation follows the new content and no control appears

### Requirement: ControlPlacement

The control SHALL be positioned over the conversation viewport near its bottom edge, above the
composer, and SHALL stay there as the conversation scrolls rather than moving with the
transcript content. It SHALL NOT cover the composer, and SHALL NOT obscure the panels that
overlay the conversation region.

#### Scenario: FixedAboveComposer
- **GIVEN** a scrolled-up conversation in the running application
- **WHEN** the reader scrolls further
- **THEN** the control stays anchored near the bottom of the conversation viewport, above the composer, and does not travel with the transcript

#### Scenario: ComposerStaysUsable
- **GIVEN** the control is visible
- **WHEN** the reader clicks into the composer and types
- **THEN** the composer receives the input; the control does not intercept it
