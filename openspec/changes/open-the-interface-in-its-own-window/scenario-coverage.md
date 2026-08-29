Every `#### Scenario:` in this change's delta — the whole of `StartingOpensTheInterface`,
since a MODIFIED requirement replaces its block — and what proves it. Built for task 5.1.
Read the assertions, not the names: a scenario counts as **covered** only when the check
would fail if the behaviour broke at the boundary the scenario describes.

Files referenced:

- `server/test/openBrowser.test.ts` (`ob`) — the three decisions the opener makes,
  with the candidate list injected so the choice is testable on any machine
- `server/test/open-browser-failure.test.mjs` (`fail`) — the wiring, over a real server
- `server/test/config.test.ts` (`cfg`) · `server/test/cli.test.ts` (`cli`)
- **live** — a real server on macOS, whose window was read back from inside it over CDP

## cli — StartingOpensTheInterface (9)

| Scenario | Status | Evidence |
| --- | --- | --- |
| StartingOnADesktopOpensTheInterface | covered | live: a real server opened Edge at its bound address, and the page reports connected, composer present, workspace visible — it is being served by the time it loads. ob "whether to open a browser" pins the desktop decision |
| ItOpensInAWindowOfItsOwn | covered | live: that window reports `display-mode: standalone` and not `browser`, read from inside it. ob "every platform's candidates produce a command asking for the window" walks the production candidate list and requires each to produce `--app=<url>`, so a candidate that stops asking for the window fails here |
| WhereNoOwnWindowIsPossible | covered | ob "a machine with no candidate gets no own-window opener" (every listed platform, plus one nothing is listed for, which must not throw) and "asking for a window on a machine that has none falls back to what this always did", which asserts the chosen command is identical to the one a tab would have used |
| TheOperatorCanAskForATab | covered | ob "asking for a tab uses the platform's own opener, even where a window was possible" asserts it on a machine where a candidate *is* present, which is the only case that can tell the two shapes apart; cfg and cli cover the setting and the flag that select it |
| LaunchedWithoutATerminal | covered | pre-existing ob assertions on `shouldOpenBrowser`: the decision is a desktop session, never a terminal. Untouched by this change |
| TheOpenedAddressIsTheBoundOne | covered | pre-existing ob assertions on `browsableUrl`, including a port chosen by the operating system. Untouched |
| NothingOpensWhereNothingCanSeeIt | covered | pre-existing ob assertions. Untouched |
| TheOperatorCanSaySoEitherWay | covered | pre-existing ob and cli assertions; cli "it says nothing about whether a browser opens at all" proves `--no-open --open-in window` does not contradict itself |
| AFailedOpenIsNotAFailedStart | covered | ob proves a failed launch answers `false` rather than throwing, for the own-window path as well as the platform one; fail drives the same over a real server and asserts it keeps running |

## Result

All **9 scenarios are covered**. There are no partial or uncovered rows.

## What no test here can establish

The Windows entries in the candidate list are paths, and a test asserts the command
built *from* a path — never that Edge or Chrome actually lives there on a Windows
machine. Only running it on Windows can say that, and it is task 4.1/4.2, still open:
the requester will check it against a beta build.

The cost of those paths being wrong is bounded by design rather than by luck: no
candidate found means no own-window opener, which means the platform opener, which is
what this did before the change. A wrong path loses the feature on Windows and breaks
nothing.

## A second near-miss, caught by CI

The first version of the two shape tests drove `openBrowser` and asserted on whether
the spawn succeeded. That measures what the machine running the test happens to have
installed: it passed on a laptop with no `xdg-open` and failed on a Linux runner that
has one. Both tests now assert the command *chosen*, which is the same everywhere and
is the only thing this change controls.

## A near-miss worth recording

The first attempt to read the window back launched Edge through Playwright with the
same `--app=` flag, and the page reported `display-mode: browser`. The obvious reading
was that the flag did not work. It was the harness: Playwright creates its own window
and the flag never applied. Launching Edge directly, with its own profile and a
debugging port, and attaching to *that* window gave `standalone: true`.

The pattern is the one the project already knows: a driver that is kinder than reality.
Here it was harsher instead, and would have cost a working feature rather than hidden a
broken one.
