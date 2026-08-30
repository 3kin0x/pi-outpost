## ADDED Requirements

### Requirement: Protect configuration-file extension paths

The system SHALL keep the extension paths declared in the configuration file out of
reach of the interface: it SHALL load them, SHALL NOT rewrite or remove them when it
persists a settings update, and SHALL hold the paths added through Settings under a
separate key.

An accepted extension-path update SHALL be persisted before the agent session is
replaced, on the same terms as every other editable setting: a write that fails leaves
the live configuration, the loaded extensions and the session in front of the user
exactly as they were.

#### Scenario: A removed user extension path leaves the deployment's paths intact
- **GIVEN** the configuration file declares an extension path
- **WHEN** the user removes their own extension paths and applies settings
- **THEN** the declared path is still in the configuration file and its extensions are still loaded

#### Scenario: Restart preserves a selected extension path
- **WHEN** the user adds a server extensions directory and applies settings
- **THEN** a restarted server loads the extensions discovered in that directory

#### Scenario: The interface offers only the user's own extension paths
- **WHEN** the settings menu shows extension paths
- **THEN** it lists the paths added through Settings and offers removal for those only

### Requirement: Refuse a locked extension change at the server

The system SHALL enforce an extension-path lock where the decision is made, not only
where the control is drawn: a request that would add or remove an extension path on a
locked server SHALL be refused, and nothing SHALL be persisted or rebuilt.

#### Scenario: A locked server refuses a hand-sent request
- **GIVEN** a configuration that locks extension paths
- **WHEN** a settings update carrying extension paths arrives from a client that drew no control for them
- **THEN** the update is refused, the configuration file is unchanged, and the session is not replaced

#### Scenario: A locked extension path does not block the rest of an apply
- **GIVEN** a configuration that locks extension paths
- **WHEN** a settings update carries only sandbox and skill changes
- **THEN** it is applied normally

## MODIFIED Requirements

### Requirement: Reload resources after settings apply
The system SHALL replace the agent session after it persists a changed skill path, extension path, or sandbox setting.

#### Scenario: New skill is visible after apply
- **WHEN** the user applies a newly selected skill directory
- **THEN** the replacement session's resource inventory includes the skills discovered from that directory

#### Scenario: New extension is loaded after apply
- **WHEN** the user applies a newly selected extension directory
- **THEN** the replacement session has loaded the extensions discovered in that directory, without a server restart
