# Scenario coverage

Every `#### Scenario:` in `specs/cli/spec.md`, with the assertion that would fail if the
contract broke. Enumerated with `rg '^#### Scenario:' openspec/changes/say-why-the-server-could-not-start/`.

| Scenario | Status | Where | What would fail |
|---|---|---|---|
| ThePortIsAlreadyTaken | covered | `server/test/startup-failure.test.mjs` — "exits non-zero with one readable line and no stack trace"; `server/test/startupFailure.test.ts` — "an occupied port names the address refused and the flag that moves it" | The integration test holds a real port (bound at 0, read back), starts a real server against it, and asserts the exit code is non-zero, that stderr names `127.0.0.1:<that port>`, says "already in use", names `--port`, carries no `at ` stack frame, no `unhandled`, and exactly one `cannot start` line. Remove the `try`/`catch` at `server/src/index.ts:742` and every one of those fails. |
| TheBindFailsForSomeOtherReason | covered | `server/test/startupFailure.test.ts` — "another reason still gets a sentence", "an unknown reason carries the reason, and never a stack" | Asserts EACCES and EADDRNOTAVAIL each name the address and the flag that applies (`--port`, `--host`); that EACCES on a high port does not blame privilege, which a reserved range or a security product can cause; that a literal IPv6 host keeps its brackets so `[::1]:3141` still names a port; and that an unrecognised code still yields a sentence carrying the underlying message and never the stack. Reached at the wire only through a port the machine refuses, which is not portable to assert; the message is the whole of what changes between codes, and it is asserted directly. |
| TheMessageOutlivesTheWindow | partial | `server/test/startupFailure.test.ts` — "a file manager above us on Windows owns the window", "a key ends the wait and hands the terminal back"; task 4.1 | The decision is asserted in full: `explorer.exe` above us on Windows is the only yes, in three spellings. The wait is driven through a supplied stream and asserts raw mode goes on and back off and the stream is paused. What no test here can establish is that a double-clicked executable on Windows really does have `explorer.exe` as its parent and really does own its window — that is task 4.1, on the requester's machine. |
| NobodyElseIsMadeToWait | covered | `server/test/startupFailure.test.ts` — "a shell borrows a console that outlives us", "no answer is not a yes", "elsewhere the terminal outlives the process", "a runner is never made to wait"; `server/test/startup-failure.test.mjs` — the same test as row 1 | Four shells answer no, an absent or empty parent answers no, macOS and Linux answer no whatever the parent, and `CI` answers no even with `explorer.exe` above. At the wire, the integration test asserts stderr never says "press any key" — it runs from a test runner, which is exactly this case, and it would hang rather than fail if the decision went the other way. |
| AServerThatStartsIsUnchanged | covered | `server/test/startup-failure.test.mjs` — "says what it always said, waits for nothing, and serves" | Starts a real server through the harness, which only resolves once `/health` answers — so a process that stopped to be dismissed fails by timing out. Then asserts the `[server] http://127.0.0.1:<port>/` line is printed as before and that the log contains neither "press any key" nor "cannot start". |

## What no test here establishes

The parent-process probe answers a real question only on Windows. `parentImageName()` is
asserted not to throw on every platform and to answer `undefined` off Windows, and
`parseTasklistImageName` is asserted against real `tasklist` CSV output and against its
polite refusal ("INFO: No tasks are running..."), which exits zero. That the string
`tasklist` actually prints for an Explorer-launched process is `explorer.exe` is what task
4.1 checks, on a machine that has one.

Task 4.2 is the other direction on the same machine: the same failing start from
PowerShell, exiting immediately with the same line and no prompt.
