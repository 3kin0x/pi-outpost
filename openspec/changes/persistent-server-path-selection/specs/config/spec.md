## ADDED Requirements

### Requirement: DurableInteractiveConfiguration
The server SHALL preserve unrelated keys and formatting-compatible JSON data when it persists editable runtime settings to its loaded configuration file.

#### Scenario: Persist an interactive skill-path update
- **WHEN** an accepted settings update adds a skill path
- **THEN** the loaded configuration file contains that path under its user skill-path key and retains unrelated configuration values, including the file's own `skillPaths`

## MODIFIED Requirements

### Requirement: ConfigPrecedence

For every setting that can come from more than one place, the server SHALL apply: command-line flag, then environment variable, then config file, then built-in default — the first one present wins, except editable runtime settings accepted through Settings. An accepted Settings update SHALL become the effective value for its managed sandbox and skill-path fields and SHALL take precedence over startup flags and environment variables for those fields. The `PI_OUTPOST_PORT` environment variable SHALL fall back to `PORT` when unset, so that a platform-injected `PORT` is honoured.

#### Scenario: EnvOverridesFile
- **GIVEN** a config file with `server.port` set to 3141
- **WHEN** the server starts with `PI_OUTPOST_PORT=8080`
- **THEN** it listens on 8080

#### Scenario: FlagOverridesEnv
- **GIVEN** `PI_OUTPOST_PORT=8080` in the environment
- **WHEN** the server starts with `--port 9000`
- **THEN** it listens on 9000

#### Scenario: SettingsOverrideStartupSources
- **GIVEN** a startup flag or environment variable overrides an editable runtime setting
- **WHEN** the user applies a replacement value in Settings
- **THEN** the replacement value is effective immediately and after the next server restart

#### Scenario: TokenNeverComesFromArgv
- **WHEN** the CLI is invoked with an unknown `--token` flag
- **THEN** it exits with an error, because a secret passed on the command line is readable by any process listing
