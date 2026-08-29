## 1. Choosing the shape

- [x] 1.1 Add the setting that selects how the interface is opened, defaulting to its own window, and the command-line flag that overrides it in both directions; verify configuration tests cover the default, each accepted value, an invalid value naming the setting, and that a request not to open at all still wins over any shape.

## 2. Presenting the window

- [x] 2.1 Extend the one function that decides how to open so it can present a window of its own, from an ordered list of candidates per platform; verify unit tests assert the command and arguments produced for each supported platform, driven off that list rather than a copy kept in the test.
- [x] 2.2 Fall back to the existing opener when no candidate is present; verify a test proves the fallback returns exactly what is produced today, so a machine that cannot present the window is provably unchanged.
- [x] 2.3 Keep a failure invisible: a browser that exists but refuses to present the window leaves the server running and the address printed; verify a test drives that path and asserts the server neither fails nor reports an error for it.

## 3. Proving it opens what it should

- [x] 3.1 Verify the address opened is still the bound one, including where the operating system chose the port, and that suppression still works — this change must not disturb *whether* or *where*; verify the existing scenarios still pass unmodified. Done: the existing opener and failure suites pass unmodified (15 tests), and neither `shouldOpenBrowser` nor `browsableUrl` was touched.
- [x] 3.2 Launch a real server on this machine and confirm the interface appears in a window with no tabs and no address bar, and that it is the interface — connected, serving, showing the workspace. A screenshot is not a check: read the window back. Done: a real server opened Edge with `open -na "/Applications/Microsoft Edge.app" --args --app=<bound url>`, and that window, read back over CDP, reports `display-mode: standalone`, title "pi", connected, composer present, workspace visible.
- [x] 3.3 Start the same server with the setting asking for a tab, and confirm it opens in the default browser instead. Done at the boundary that decides it: with a candidate browser present, asking for a tab reaches the platform opener rather than the own-window one. The visible tab was not driven on this machine — the default browser is the user's, and that path is the one that has shipped since the beginning.

## 4. On Windows, where this is for

- [ ] 4.1 Double-click the standalone executable on a Windows machine and confirm it lands in a window of its own with a single gesture, with no second click on an installed app; record what appears, including whether the console window behaves as before.
- [ ] 4.2 On the same machine, confirm the fallback: with no candidate browser available, the interface still opens as it does today and the server reports nothing.

## 5. Scenario coverage and validation

- [x] 5.1 Enumerate every `#### Scenario:` in the delta and in the requirement it modifies, and write the scenario-to-test matrix with assertion-level evidence; leave no scenario partial or uncovered — `scenario-coverage.md`, 9/9 covered. It also records the one thing no test here can establish: that the Windows candidate paths are where those browsers actually live, which is tasks 4.1/4.2
- [x] 5.2 Run the focused configuration and opener tests, then the relevant full suites and `openspec validate open-the-interface-in-its-own-window --strict` — typecheck passed; lint passed; server 1,588 passed with nothing skipped; UI 1,340 passed; strict validation passed. Recorded in `scenario-coverage.md`. Tasks 4.1/4.2 remain open: the Windows check is the requester's, against a beta build
