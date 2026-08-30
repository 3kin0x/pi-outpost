## 1. Configuration: the second list and the lock

- [x] 1.1 Add `userExtensionPaths` to the loaded configuration beside `extensionPaths`, parsed and resolved the way `userSkillPaths` is, with an `allExtensionPaths()` helper beside `allSkillPaths()`. Verify a configuration file declaring both keys loads extensions from both, and that a directory in either is discovered rather than imported as a file.
- [x] 1.2 Add both lists to `sandbox.readExceptions` at load time. Verify with a sandbox whose root does not contain the user's extension directory that the agent may read it — the failure this prevents is an extension the agent is forbidden to read. Done; `server/test/extensionPaths.test.ts` covers all four tasks of this group, 9 tests. `allExtensionPaths()` now feeds the session factory, the readExceptions recomputation in `handleUpdateConfig`, and the RPC `--extension` args, so no consumer sees only half the list.
- [x] 1.3 Add `extensionLock` following the `workspaceLock` convention, documented in `config.ts` as such. Verify it parses, defaults to absent, and that absent means editable.
- [x] 1.4 Extend `EditableSettings` and the persist path so `userExtensionPaths` is written to the configuration file the server loaded, leaving `extensionPaths` untouched. Verify by reading the file back after an apply: the declared paths are byte-for-byte what they were.

## 2. The server side of an apply

- [x] 2.1 Accept `userExtensionPaths` in `update_config`, validated exactly as `userSkillPaths` is (array of non-empty strings, resolved against the configuration file's directory). Verify a malformed payload is refused with an error and nothing is persisted.
- [x] 2.2 Refuse an extension-path change when `extensionLock` is set, before anything is persisted or rebuilt. Verify with a hand-sent message from a client that drew no control: the file is unchanged, the session is not replaced, and the client is told why. Verify too that a locked server still accepts sandbox and skill changes in the same message shape.
- [x] 2.3 Recompute `readExceptions` from the new lists and rebuild the session on an accepted extension change, as the skill path already does. Verify the replacement session has loaded an extension from the newly added directory without a server restart, and that removing that path rebuilds a session without it.
- [x] 2.4 Carry `userExtensionPaths` and the lock flag in the snapshot and in the `update_config` acknowledgement. Verify at the wire, on a real server, that a connecting client is told both. Group done: `server/test/extensionPathsWire.test.mjs`, 4 servers, all green — an applied directory's extension registers its command in the replacement session, removal rebuilds one without it, the locked server refuses a hand-sent change while still applying a skill change in the same shape, and an RPC server omits the inventory. One trap worth recording: `harness.waitFor("type")` resolves with the first message *already received*, so waiting twice for `update_config_ack` hands back the first one and the second assertion passes on stale state. Both waits now name what they want.

## 3. An honest inventory

- [x] 3.1 Make the loaded-extension inventory absent rather than empty where a runtime cannot report one — `RuntimeState.extensionPaths` optional, filled by the embedded runtime and omitted by the RPC one, and the snapshot omitting the key rather than sending `[]`. Verify at the wire that an RPC server's snapshot omits it while an embedded server's lists the files it loaded: the point is that "none" and "cannot say" stop looking identical.
- [x] 3.2 Carry the deployment's own `extensionPaths` to the client as `configuredExtensionPaths`, separate from the user's, so the menu can show what it must not offer to remove. Verify both appear in the snapshot and that neither is the other.

## 4. The settings menu

- [x] 4.1 Give `PickerField` an `extension` member and draw the extension section with the picker, the per-entry Remove, and the same draft-then-apply behaviour the skill paths have. Verify with component tests that choosing a directory and removing an entry both reach the update callback with the expected list.
- [x] 4.2 Show the warning when the extension picker opens: that extensions run with the agent's privileges, and that a directory loads every extension inside it. Verify it is present at the moment of adding and states both facts.
- [x] 4.3 Hide every extension-editing control when the snapshot reports the lock, while still listing what is loaded. Verify the loaded list is present and no add or remove control is.
- [x] 4.4 Say "not reported by this runtime" rather than "No extensions loaded" when the inventory is absent. Verify the two cases render differently.
- [x] 4.5 Put every inventory behind one collapsed summary line stating its count — "3 extensions loaded" — and sort each list so it reads the same way twice. The extensions section has no disclosure at all today. Verify each summary states its count, that none is expanded until opened, and that every supplied entry is reachable once one is. Group done: `SettingsMenu.test.tsx` 41 passing, 8 of them new. Two things the work forced: the add button had to say *which* directory it adds now that two of them sit together ("Add skills directory…" / "Add extensions directory…"), and a locked list is left **out** of the apply payload rather than sent unchanged — the server refuses any update carrying extension paths under a lock, which would take a legitimate skill change down with it.

## 5. Prove it in the running app

- [x] 5.1 Drive the real widget: add an extension directory through Settings, apply, and read back that the extension loaded — the session transcript or the extension's own observable effect, not a screenshot. This is the check unit tests cannot make, and the one that catches a control that looks right and reports nothing. Done: `e2e/settings-extensions.spec.ts`, 2 specs, both green. The chain is asserted at its end — after the apply the extension's own command answers in the composer, which nothing short of a real session rebuild produces. Two things the browser taught: the menu closes itself on a successful apply, so reopening it while the acknowledgement is in flight opens a menu the ack closes again (both applies now wait for it); and the inventory reports the *directory* as configured, not the file the SDK discovered inside it.
- [x] 5.2 In the same run, open the extensions summary and confirm its count matches what the server reported, then remove the extension path and confirm the session comes back without it.
- [x] 5.3 Add a Playwright case for the locked deployment: a server started with `extensionLock` offers no extension control.

## 6. Land it

- [x] 6.1 Write the scenario-to-test matrix for all four delta specs with assertion-level evidence, leaving no scenario partial or uncovered. Enumerate with `rg '^#### Scenario:' openspec/changes/add-user-extension-paths/specs/` so none is silently omitted.
- [x] 6.2 Run lint, typecheck, the server and UI suites, and Playwright. Then `openspec validate add-user-extension-paths --strict`.
- [ ] 6.3 Open the change and verify CI is green on both platforms before merging.
