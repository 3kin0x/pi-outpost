## Purpose

Makes runtime settings changed from the web interface durable across server and agent-session restarts.

## ADDED Requirements

### Requirement: Persist editable runtime settings
The system SHALL persist an accepted settings update to the configuration file it loaded before replacing the agent session.

#### Scenario: Restart preserves selected skill path
- **WHEN** the user adds a mounted server skills directory and applies settings
- **THEN** a restarted server loads that directory in addition to built-in skills

#### Scenario: Persistence failure keeps the live configuration
- **WHEN** the loaded configuration file cannot be written
- **THEN** the system reports the persistence failure and does not replace the session or claim the settings were applied

### Requirement: Protect configuration-file skill paths
The system SHALL keep the skill paths declared in the configuration file out of reach of the interface: it SHALL load them, SHALL NOT rewrite or remove them when it persists a settings update, and SHALL hold the paths added through Settings under a separate key.

#### Scenario: A removed user path leaves the deployment's paths intact
- **GIVEN** the configuration file declares a skill path
- **WHEN** the user removes their own skill paths and applies settings
- **THEN** the declared path is still in the configuration file and its skills are still loaded

#### Scenario: The interface offers only the user's own paths
- **WHEN** the settings menu shows skill paths
- **THEN** it lists the paths added through Settings and offers removal for those only

### Requirement: Reload resources after settings apply
The system SHALL replace the agent session after it persists a changed skill path or sandbox setting.

#### Scenario: New skill is visible after apply
- **WHEN** the user applies a newly selected skill directory
- **THEN** the replacement session's resource inventory includes the skills discovered from that directory

