## 1. Resolving the executable

- [x] 1.1 Add a resolver in `server/src/git.ts` that tries the configured path, then `git` on `PATH`, then the platform's standard locations, ending at the first that answers `git --version`; verify unit tests cover a hit on PATH, a hit on a standard location with PATH empty, and no hit at all
- [x] 1.2 Make a configured path that does not answer fail resolution outright rather than falling through; verify a test asserts the failure names that path and that no other candidate was tried
- [x] 1.3 Hold the resolved path for the process and spawn every git command with it instead of the bare name; verify `rg 'execFile.*"git"' server/src` finds no bare-name spawn left
- [x] 1.4 Keep every candidate absolute and independent of the workspace, browser root and cwd; verify a test asserts that a `git` executable planted in the workspace root is never resolved

## 2. Configuration

- [x] 2.1 Add the optional git executable setting to `server/src/config.ts` with the same shape as the existing optional settings; verify a config test loads it and exposes it
- [x] 2.2 Fail startup with an error naming the setting and the path when the configured executable cannot run; verify a test asserts the message contains both
- [x] 2.3 Leave resolution to `PATH` and the standard locations when the setting is absent; verify a test asserts an unset config resolves the same git as before

## 3. Saying why

- [x] 3.1 Replace `probeGit`'s `catch { return null }` with a classified result — no executable, no repository, refused with git's first stderr line; verify unit tests cover all three against real fixtures, including a repository made unreadable to git
- [x] 3.2 Classify an unrecognised failure as refused rather than as no repository; verify a test drives an unexpected git failure and asserts the loud classification
- [x] 3.3 Derive the workspace's reason from the repository set being empty, and carry it in the session snapshot beside `gitAvailable`; verify a wire test reads the reason for each of the three cases
- [x] 3.4 Clear the reason when a repository appears and the set is re-established; verify a wire test starts with no repository, creates one, and asserts git becomes available with no reason

## 4. Interface

- [x] 4.1 Show the reason in the settings panel: the fault cases name the path tried or repeat git's message, the no-repository case states it plainly with nothing to fix; verify component tests for all three
- [x] 4.2 Leave every existing `gitAvailable` gate alone, so a client that only reads the boolean is unaffected; verify the existing git UI tests pass unchanged

## 5. Documentation

- [x] 5.1 Document the new setting where the other optional settings are documented, and the diagnosis it enables; verify the documented key and example match `config.ts`
- [x] 5.2 Prepare the `Documentation impact` note for the PR description per AGENTS.md; verify every affected document is listed

## 6. Verification

- [x] 6.1 Rehearse the reported failure end to end: a workspace whose git is unreachable by `PATH` alone, and assert git features come back through the standard-location search; verify with a test that empties `PATH` for the spawned server
- [x] 6.2 Produce the scenario-to-test matrix over every `#### Scenario:` in the `git` and `config` deltas, classifying each covered/partial/uncovered with its test file and name; verify the list with `rg '^#### Scenario:' openspec/changes/find-git-and-explain-its-absence/specs/`
- [x] 6.3 Drive it in the running app per the bench workflow, including the destructive pass required by AGENTS.md — start with git unreachable, read the settings panel, then make git reachable and confirm the surface returns; verify the observed DOM
- [x] 6.4 Run `openspec validate find-git-and-explain-its-absence --strict` and the server, shared and UI suites; verify all pass
