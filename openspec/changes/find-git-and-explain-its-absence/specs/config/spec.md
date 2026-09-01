## ADDED Requirements

### Requirement: GitExecutableSetting

The configuration SHALL support naming the git executable, for a deployment where git is
installed somewhere the system would not look. It SHALL be optional: unset, the system
resolves git from `PATH` and then from the platform's standard installation locations.

A value that is not a runnable git SHALL make startup fail with an error naming the setting
and the path, rather than falling back to another git. An operator who names an executable
is stating which one to use.

#### Scenario: ConfiguredExecutableIsUsed
- **GIVEN** a configuration naming a git executable
- **WHEN** the server starts
- **THEN** git commands run that executable

#### Scenario: UnsetResolvesFromTheEnvironment
- **GIVEN** a configuration naming no git executable
- **WHEN** the server starts
- **THEN** git is resolved from `PATH`, and failing that from the platform's standard locations

#### Scenario: InvalidExecutableValue
- **GIVEN** a configuration whose git executable setting is not a runnable git
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming the setting and the path
