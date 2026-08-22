## MODIFIED Requirements

### Requirement: RuntimeControls
The component layer SHALL expose runtime controls through `Header`, `ModelBar`, `SettingsMenu`,
`Onboarding`, `TokenGate`, and `TreeMenu`. These components SHALL render only the runtime,
configuration, credential, authentication, session-tree, and version state supplied to them and
SHALL report requested changes through callbacks. `SettingsMenu` SHALL show the user's own
skill paths separately from built-in skills, SHALL NOT present the configuration file's skill paths
as editable, and SHALL offer server-directory exploration controls for every path-valued setting it
edits.

#### Scenario: ChangeModelOrThinkingLevel
- **GIVEN** model choices and thinking state supplied to `ModelBar`
- **WHEN** the user selects a model or thinking level
- **THEN** the corresponding callback is invoked with the requested value

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

#### Scenario: SubmitAuthenticationToken
- **GIVEN** `TokenGate` is displayed after authentication is required
- **WHEN** the user submits a token
- **THEN** the token is reported through the component's submit callback

#### Scenario: NavigateConversationTree
- **GIVEN** conversation-tree state supplied to `TreeMenu`
- **WHEN** the user selects a navigation or fork action
- **THEN** the requested action is reported through the corresponding callback
