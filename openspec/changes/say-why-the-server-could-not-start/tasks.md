## 1. The message

- [x] 1.1 Add the function that turns a failed bind into the line an operator reads, from the error, the host and the port; verify unit tests assert the occupied-port case names both the address refused and the flag that moves it, that another bind failure still produces a readable line, and that neither carries a stack.

## 2. The decision to hold the console

- [x] 2.1 Add the function that decides whether this process owns the console it printed on, from the platform, the environment and the parent's identity, with the parent supplied rather than looked up; verify unit tests assert a confident yes only for a file-manager parent on Windows, and no for a shell parent, an unknown parent, a probe that answered nothing, a non-Windows platform, and a continuous integration runner — the last taking precedence over everything else.
- [x] 2.2 Add the real parent probe behind that injection point, reading the parent's image name once and only when asked; verify a test proves a probe that fails or finds nothing returns no answer rather than throwing, so the decision degrades to "do not hold".

## 3. Joining the failure path

- [x] 3.1 Guard the one unguarded `await app.listen(...)` so a failure goes through the file's existing `complain()` and exits non-zero, and hold the console before exiting where the decision says to; verify a test starts a server on a port already bound — bound at port 0 and read back, never a fixed number — and asserts the exit code, the single line on stderr, and the absence of a stack trace.
- [x] 3.2 Verify the success path is untouched: a test asserts a server that binds prints what it printed before, waits for nothing, and answers `/health`. Done: `startup-failure.test.mjs` asserts the address line, the absence of any prompt to dismiss, and a served `/health`. "Never consulted" is structural rather than asserted — the probe has one call site, inside the `catch` at `server/src/index.ts:742`; nothing on the success path can reach it.

## 4. Proving it where it was found

- [ ] 4.1 On Windows, double-click the standalone executable while another instance holds the port, and confirm the window stays open with the message in it until dismissed; record what appears verbatim.
- [ ] 4.2 On the same machine, run the same failing start from PowerShell and confirm it exits immediately with the same line and no prompt to dismiss.

## 5. Scenario coverage and validation

- [x] 5.1 Enumerate every `#### Scenario:` in the delta, write the scenario-to-test matrix with assertion-level evidence, and leave none partial or uncovered; name explicitly which scenarios only tasks 4.1/4.2 can establish — `scenario-coverage.md`: 4/5 covered, `TheMessageOutlivesTheWindow` partial by construction, since only a Windows machine can prove a double-clicked process has `explorer.exe` above it.
- [x] 5.2 Run the focused tests, then the server suite, typecheck, lint, and `openspec validate say-why-the-server-could-not-start --strict` — 18 focused tests passed; server suite 1,642 passed with nothing skipped; typecheck and lint clean; strict validation passed.
