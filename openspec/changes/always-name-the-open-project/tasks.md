## 1. What the server says

- [x] 1.1 Send the bound project and the list of open projects on every snapshot, without a threshold; verify a wire test connects to a server with exactly one open project and asserts both are present and describe it, and that a second connection after opening another still describes each correctly.
- [x] 1.2 Verify the same fields ride every acknowledgement that carries a snapshot — a switch, a session replacement, a settings apply — on a single-project server; a field present at connection and absent afterwards would make the control empty itself under the user.

## 2. What the interface shows

- [x] 2.1 Remove the single-project branch from the project selector so one project renders the named control with its activity, and the menu offers that project and opening another; verify component tests cover one project, two, and the transition, asserting the same control is present throughout.
- [x] 2.2 Verify the attention badge, the amber tint and the activity mark behave identically at one project and at several — they were only ever exercised above the threshold, and the branch that is being deleted is what kept them from being reached.
- [x] 2.3 Verify a pinned server and an embed whose policy withholds the control still show nothing at all; naming a project must never resurrect a control a deployment refused.

## 3. What the fields being present changes elsewhere

- [x] 3.1 Drive the widget against a real single-project server and confirm it still shows no workspace control: the fields are additive and the embed gates on its policy, so nothing should appear — observed in the running app rather than assumed. Confirmed in the bench: with the fields now always present, the widget on a single-project server shows no project control and no root control — the embed policy gates it, exactly as the code said it would.

## 4. In the running app

- [x] 4.1 Drive a single-project server in the bench and read the header back: the project is named, its state is shown, and opening another is reachable from the same control. Confirmed: the header reads `pi-outpost-test-1YyAmK` with title `Projet : … (au repos)`, and the menu holds that project plus "Ouvrir un projet…" — two items, no close button, since the last project cannot be closed.
- [x] 4.2 In the same session, open a second project and confirm the control did not change shape — the same element, in the same place, now offering a choice. Confirmed: same `BUTTON`, same 26px height, same title format; the menu went from 2 rows to 3 and gained its close buttons. The control did not change shape.

## 5. Scenario coverage and validation

- [x] 5.1 Enumerate every `#### Scenario:` in both deltas and in the requirements they modify, and write the scenario-to-test matrix with assertion-level evidence; leave no scenario partial or uncovered — `scenario-coverage.md`, 10/10 covered. It also lists the four assertions that had to flip, each one a place the old absence was observable
- [x] 5.2 Run the focused server, component and interface tests, then the relevant full suites, the Playwright suite, and `openspec validate always-name-the-open-project --strict` — typecheck passed; lint passed; server 1,589 passed with nothing skipped; UI 1,346 passed and the coverage gate held (93.36% functions); Playwright 46/46 passed; strict validation passed. Recorded in `scenario-coverage.md`
