## ADDED Requirements

### Requirement: FileWatchSetting

The configuration SHALL support a setting that turns file-browser directory watching on or off.
It SHALL default to on, so a workspace browser tells the truth about the workspace without being
configured to.

It SHALL be settable to off, for hosts where watching is a liability rather than a feature — a
filesystem that emits no events, or one whose watch budget is spent elsewhere.

An invalid value SHALL make startup fail with an error naming the setting, like every other
configuration error.

#### Scenario: WatchingOnByDefault
- **GIVEN** a configuration that does not mention file watching
- **WHEN** the configuration is loaded
- **THEN** watching is enabled

#### Scenario: WatchingExplicitlyDisabled
- **GIVEN** a configuration that sets file watching to false
- **WHEN** the configuration is loaded
- **THEN** watching is disabled

#### Scenario: InvalidWatchSetting
- **GIVEN** a configuration whose file-watching setting is not a boolean
- **WHEN** the configuration is loaded
- **THEN** loading fails with an error naming the setting
