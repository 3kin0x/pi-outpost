## 1. The setting

- [x] 1.1 Add the optional declaration list to `server/src/config.ts`, keyed by provider with an optional model id; verify a config test loads a provider-wide and a model-specific entry
- [x] 1.2 Normalise each entry's levels through the shared `normalizeThinkingLevels`, and fail startup on an entry that normalises to nothing; verify tests cover an empty list, a list of unknown names, and a list mixing a known and an unknown name
- [x] 1.3 Fail startup naming the setting and the entry when an entry is not an object or names no provider; verify a test asserts the message carries both

## 2. Resolution

- [x] 2.1 Resolve a model's declared levels — the entry naming its id, else the provider-wide entry, else none; verify unit tests cover both matches, the precedence between them, and no match
- [x] 2.2 Use the declaration in place of the runtime's list wherever the snapshot reports accepted levels, on connect and on a model change; verify a wire test reads the declared set for a model whose runtime reports a different one, and for one it reports nothing about

## 3. Refusal

- [x] 3.1 Refuse a `set_thinking` naming a level outside a declared set, leaving the current level unchanged; verify a wire test asserts the level does not move
- [x] 3.2 Leave `set_thinking` untouched where nothing is declared; verify the existing thinking tests pass unchanged

## 4. Documentation

- [x] 4.1 Document the setting beside `allowedModels`, with the in-house-endpoint case that motivates it; verify the documented shape matches `config.ts`
- [x] 4.2 Prepare the `Documentation impact` note for the PR description per AGENTS.md; verify every affected document is listed

## 5. Verification

- [x] 5.1 Produce the scenario-to-test matrix over every `#### Scenario:` in the `config` and `api` deltas, classifying each covered/partial/uncovered with its test file and name; verify the list with `rg '^#### Scenario:' openspec/changes/declare-what-thinking-a-model-accepts/specs/`
- [x] 5.2 Drive it in the running app, including the destructive pass AGENTS.md requires — a declared `off`-only model, the slider it produces, and a `set_thinking` sent past it; verify the observed DOM
- [x] 5.3 Run `openspec validate declare-what-thinking-a-model-accepts --strict` and the server, shared and UI suites; verify all pass
