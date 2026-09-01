## MODIFIED Requirements

### Requirement: RuntimeControls

The component layer SHALL expose runtime controls through `Header`, `ModelBar`, `SettingsMenu`,
`Onboarding`, `TokenGate`, and `TreeMenu`. These components SHALL render only the runtime,
configuration, credential, authentication, session-tree, and version state supplied to them and
SHALL report requested changes through callbacks. `SettingsMenu` SHALL show the user's own
skill paths separately from built-in skills, SHALL NOT present the configuration file's skill paths
as editable, and SHALL offer server-directory exploration controls for every path-valued setting it
edits.

`ModelBar`'s thinking-level control SHALL offer only the levels supplied for the current model, in
the order supplied, and SHALL present a set with gaps as that many ordered stops rather than a
continuous range — every stop it shows SHALL be a level the model accepts, so a selection never
snaps back. Where no such list is supplied it SHALL fall back to the full set of known levels, which
is the behaviour before this control was made model-aware.

`SettingsMenu` SHALL offer the same controls for the user's own extension paths that it offers for
skill paths — server-directory exploration, per-entry removal, and reporting the result through its
update callback — and SHALL NOT present the configuration file's extension paths as editable.

Because an extension is code that runs with the agent's privileges, and a directory loads every
extension found inside it, `SettingsMenu` SHALL state that before an extension path is added,
in the flow that adds one rather than only in a caption. Where extension paths are locked it SHALL
offer no control that would change them.

Every inventory `SettingsMenu` presents SHALL be reachable from a single collapsed summary line
stating how many it holds — "3 extensions loaded" — rather than drawn open. A menu whose sections
are all expanded is one an installation with many resources cannot read; the count is what the
summary is for. Each list SHALL be presented in a stable order that does not depend on the order
the server happened to report.

#### Scenario: ChangeModelOrThinkingLevel
- **GIVEN** model choices and thinking state supplied to `ModelBar`
- **WHEN** the user selects a model or thinking level
- **THEN** the corresponding callback is invoked with the requested value

#### Scenario: TheThinkingControlOffersOnlyTheModelsLevels
- **GIVEN** `ModelBar` is supplied with a current model that accepts `low`, `medium` and `xhigh` but not `high`
- **WHEN** the thinking control is opened
- **THEN** it presents `off`, `low`, `medium` and `xhigh` as ordered stops and no `high`
- **AND** selecting the last stop reports `xhigh` through the callback

#### Scenario: TheThinkingControlFallsBackWithoutAList
- **GIVEN** `ModelBar` is supplied with no accepted-levels list for the current model
- **WHEN** the thinking control is opened
- **THEN** it offers the full set of known levels, as it did before

#### Scenario: PresentSandboxSettings
- **GIVEN** sandbox, extension-path, and version state supplied to `SettingsMenu`
- **WHEN** the settings menu is opened
- **THEN** the supplied settings and version information are presented

#### Scenario: Select a server skill directory
- **GIVEN** SettingsMenu is supplied with the user's skill paths and a server-directory explorer callback
- **WHEN** the user chooses a mounted directory for additional skills
- **THEN** SettingsMenu reports the selected server path in its requested settings update

#### Scenario: Remove a user skill path
- **GIVEN** SettingsMenu is supplied with a skill path the user added
- **WHEN** the user removes it and requests an apply
- **THEN** the requested update carries the remaining user skill paths and nothing from the configuration file

#### Scenario: Select a server extension directory
- **GIVEN** SettingsMenu is supplied with the user's extension paths and a server-directory explorer callback
- **WHEN** the user chooses a mounted directory for additional extensions
- **THEN** SettingsMenu reports the selected server path in its requested settings update

#### Scenario: Remove a user extension path
- **GIVEN** SettingsMenu is supplied with an extension path the user added
- **WHEN** the user removes it and requests an apply
- **THEN** the requested update carries the remaining user extension paths and nothing from the configuration file

#### Scenario: Adding an extension path says what it means
- **GIVEN** SettingsMenu is supplied with the user's extension paths
- **WHEN** the user starts adding an extension directory
- **THEN** the menu states that extensions are code run with the agent's privileges and that every extension in the directory is loaded, before the path is added

#### Scenario: A locked deployment offers no extension control
- **GIVEN** SettingsMenu is supplied with state reporting extension paths as locked
- **WHEN** the settings menu is opened
- **THEN** it presents the loaded extensions without any control that would add or remove one

#### Scenario: Every inventory opens from a counted summary
- **GIVEN** SettingsMenu is supplied with loaded extensions and skills
- **WHEN** the settings menu is opened
- **THEN** each inventory shows a summary line stating how many it holds, none of them expanded, and opening one reveals its entries

#### Scenario: Inventories read in a stable order
- **GIVEN** SettingsMenu is supplied with entries in an order the server chose
- **WHEN** the settings menu is opened
- **THEN** each list is presented in a stable order rather than the order supplied

#### Scenario: SubmitAuthenticationToken
- **GIVEN** `TokenGate` is displayed after authentication is required
- **WHEN** the user submits a token
- **THEN** the token is reported through the component's submit callback

#### Scenario: NavigateConversationTree
- **GIVEN** conversation-tree state supplied to `TreeMenu`
- **WHEN** the user selects a navigation or fork action
- **THEN** the requested action is reported through the corresponding callback
