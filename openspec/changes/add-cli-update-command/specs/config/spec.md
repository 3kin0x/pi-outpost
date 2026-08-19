## ADDED Requirements

### Requirement: UpdateCheckSetting

The configuration SHALL support a setting that turns update checking on or off, distinct from `offline`. Three states are meaningful and SHALL be distinguishable: unset, explicitly on, explicitly off.

- Unset SHALL mean enabled, except under `offline`, where it SHALL mean disabled.
- Explicitly on SHALL enable checking even under `offline` — a host cut off from model catalogs may still reach a package registry through an internal proxy.
- Explicitly off SHALL disable checking whatever `offline` says.

An invalid value SHALL make startup fail with an error naming the setting, like every other configuration error.

#### Scenario: UpdateCheckOnByDefault
- **GIVEN** a configuration that mentions neither update checking nor `offline`
- **WHEN** the server starts
- **THEN** the startup check is enabled, subject to the caching interval and the channel rules

#### Scenario: OfflineDisablesItWhenUnset
- **GIVEN** a configuration with `offline` and no update-check setting
- **WHEN** the server starts
- **THEN** no registry request is made

#### Scenario: ExplicitlyOnOverridesOffline
- **GIVEN** a configuration with `offline` and update checking explicitly enabled
- **WHEN** the server starts
- **THEN** the update check runs while model catalogs remain unfetched

#### Scenario: ExplicitlyOffOverridesEverything
- **GIVEN** a configuration that disables update checking while leaving `offline` unset
- **WHEN** the server starts
- **THEN** no registry request is made, and model catalogs are still fetched as usual

#### Scenario: InvalidUpdateCheckValue
- **GIVEN** a configuration whose update-check setting is not a boolean
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming the setting

### Requirement: UpdateRegistrySetting

The configuration SHALL support naming the package registry that update checks query, for a deployment whose registry is an internal proxy rather than the public one. It SHALL be optional: unset, the system resolves the registry from the package manager's configuration, and failing that from the public default.

An invalid value SHALL make startup fail with an error naming the setting.

#### Scenario: RegistryOverrideIsUsed
- **GIVEN** a configuration naming an internal registry
- **WHEN** an update check runs
- **THEN** the request goes to that address

#### Scenario: RegistryUnsetResolvesFromTheEnvironment
- **GIVEN** a configuration naming no registry
- **WHEN** an update check runs
- **THEN** the registry comes from the package manager's own configuration, or the public default when it names none

#### Scenario: InvalidRegistryValue
- **GIVEN** a configuration whose registry setting is not a usable URL
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming the setting
