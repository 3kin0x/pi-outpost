# Configuration Specification

## Purpose

Where the server's configuration comes from, and who wins when several places answer. One file is
read — the first of six locations that exists — and never merged with another, so the file you are
reading is the configuration that is running. Above it: environment variables, then command-line
flags. Below it: nothing. Without a configuration file the server refuses to start rather than
inventing a permissive one.

## Requirements

### Requirement: ConfigDiscoveryOrder

The server SHALL look for its configuration file in this order, and SHALL use the first one it finds: the path given by `--config`, then `PI_OUTPOST_CONFIG`, then `pi-outpost.config.json` in the launch directory, then `config.json` under the user config directory (`$XDG_CONFIG_HOME/pi-outpost`, defaulting to `~/.config/pi-outpost`). Exactly one file SHALL be read — configurations SHALL NOT be merged across locations. A path given explicitly (`--config`, `PI_OUTPOST_CONFIG`) that does not exist SHALL be an error; the two implicit locations SHALL be skipped when absent. The server SHALL log the path of the file it loaded.

#### Scenario: LocalFileWinsOverUserFile
- **GIVEN** both `./pi-outpost.config.json` and `~/.config/pi-outpost/config.json` exist
- **WHEN** the server starts with no `--config` and no `PI_OUTPOST_CONFIG`
- **THEN** it loads the local file, and no key of the user-level file takes effect

#### Scenario: UserFileUsedWhenNoLocalFile
- **GIVEN** only `~/.config/pi-outpost/config.json` exists
- **WHEN** the server starts from a directory with no config file
- **THEN** it loads the user-level file and logs its path

#### Scenario: ExplicitPathMissing
- **WHEN** `--config ./nope.json` names a file that does not exist
- **THEN** the server exits with an error naming that path

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

### Requirement: OfflineModelCatalogs

The server SHALL support an `offline` setting — config file `offline`, the `--offline` flag, or the pi SDK's own `PI_OFFLINE` environment variable — that keeps the model runtime from fetching remote model catalogs. When it is set, the server SHALL make the SDK aware of it before the model runtime is constructed, because the SDK reads that variable once at construction.

Off a network that can reach the catalogs, the fetch runs on every credential change; on a host that cannot — air-gapped, or behind a proxy that does not route it — the request hangs until the server's ceiling cuts it, stalling each change by that ceiling. Built-in models and providers declared in `models.json` remain available either way: the catalog only adds metadata for models the SDK already knows.

#### Scenario: OfflineFromTheConfigFile
- **GIVEN** a config file with `"offline": true`
- **WHEN** the server starts
- **THEN** no remote model catalog is fetched, and the startup log says so

#### Scenario: OfflineFromTheEnvironment
- **GIVEN** `PI_OFFLINE` set to a non-empty value
- **WHEN** the server starts
- **THEN** offline mode is on, whatever the config file says

#### Scenario: AbsentFlagDoesNotOverrideTheFile
- **GIVEN** a config file with `"offline": true`
- **WHEN** the server starts without `--offline`
- **THEN** offline mode stays on, because a flag that was not passed is not a value

### Requirement: ConfigProfiles

The server SHALL accept a profile name (`--profile <name>` or `PI_OUTPOST_PROFILE`) and SHALL load `profiles/<name>.json` from the user config directory. A profile file SHALL be an ordinary config file, subject to the same validation and the same relative-path resolution. Naming both a profile and an explicit `--config` path SHALL be an error. A named profile that does not exist SHALL be an error.

#### Scenario: ProfileSelectsUserFile
- **GIVEN** `~/.config/pi-outpost/profiles/work.json` exists
- **WHEN** the server starts with `--profile work`
- **THEN** it loads that file, even if `./pi-outpost.config.json` also exists

#### Scenario: ProfileAndConfigTogether
- **WHEN** the server starts with both `--profile work` and `--config other.json`
- **THEN** it exits with an error

### Requirement: RefuseToStartWithoutConfig

When no configuration file is found in any location, the server SHALL exit with a non-zero status and a message telling the user how to create one (`pi-outpost init`, or `pi-outpost init --global`). It SHALL NOT fall back to an implicit permissive configuration.

#### Scenario: BareInvocationInAnEmptyDirectory
- **WHEN** `pi-outpost` runs in a directory with no config file, no `PI_OUTPOST_CONFIG`, and no user-level config
- **THEN** it exits non-zero, prints the locations it looked in, and names `pi-outpost init`
- **AND** no agent session is created and no port is bound

### Requirement: CredentialLocation

The system SHALL read and write model credentials in the `auth.json` of the agent directory it is configured with — `<agentDir>/auth.json`, defaulting to `~/.pi/agent/auth.json` — and SHALL make that location explicit wherever credentials are documented or reported. Provider environment variables SHALL keep working as the other source of credentials. A configuration naming its own `agentDir` therefore starts with no credentials, and the system SHALL offer a way to supply them (web onboarding or `pi-outpost login`) rather than requiring a file to be copied in by hand.

#### Scenario: IsolatedAgentDirStartsEmpty
- **GIVEN** a configuration naming an `agentDir` that has no `auth.json`
- **WHEN** the server starts
- **THEN** it reports that no provider is configured, and points at that directory — not at `~/.pi/agent`

#### Scenario: EnvironmentVariablesStillWork
- **GIVEN** no `auth.json` but a provider environment variable in the environment
- **WHEN** the server starts
- **THEN** a usable model is reported and no onboarding is shown

### Requirement: CustomProviderLocation

The system SHALL read and write custom provider declarations — an OpenAI-compatible endpoint's base URL, models, and compatibility flags — in the `models.json` of the configured agent directory, in the SDK's own format. A provider declared through the UI SHALL therefore be visible to any pi process sharing that agent directory, and SHALL survive a restart.

#### Scenario: DeclaredProviderPersists
- **GIVEN** a custom OpenAI-compatible provider declared from the UI
- **WHEN** the server is restarted
- **THEN** the provider's models are still listed, without redeclaring them

### Requirement: TlsTrustIsEnvironmental

The system SHALL NOT expose a configuration key that disables TLS certificate verification. Trusting an internal certificate authority (the corporate TLS-inspecting proxy case) SHALL be done with `NODE_EXTRA_CA_CERTS`, and the system SHALL name that variable when a request fails because a certificate could not be verified.

#### Scenario: NoInsecureConfigKey
- **WHEN** a configuration file asks to disable TLS verification
- **THEN** no such key exists; verification cannot be turned off from a file that can be copied between machines

### Requirement: AgentRuntimeSelection

The configuration SHALL select the agent runtime as either `embedded` or `rpc`, defaulting to
`embedded`. RPC configuration SHALL name the Pi executable and MAY supply extra fixed arguments;
the command SHALL always be invoked in Pi RPC mode by pi-outpost rather than relying on an argument
the operator happens to include.

The configured executable and arguments SHALL be logged in a form that excludes secrets. Invalid
runtime values, an empty executable, arguments that try to override RPC mode, or a conflicting
session/agent directory setting SHALL make startup fail with an error naming the invalid setting.

#### Scenario: EmbeddedRemainsDefault
- **GIVEN** a configuration with no runtime selection
- **WHEN** pi-outpost starts
- **THEN** it uses the embedded runtime with its existing behavior

#### Scenario: RpcRuntimeConfigured
- **GIVEN** a configuration selecting `rpc` and a valid Pi executable
- **WHEN** pi-outpost starts
- **THEN** it starts that executable in RPC mode and logs the selected runtime without secrets

#### Scenario: InvalidRpcConfiguration
- **WHEN** RPC runtime configuration has an unknown mode, empty executable, or prohibited override argument
- **THEN** startup fails before the server accepts clients and names the configuration error

### Requirement: RpcRuntimeServesTheConfiguredResources

The RPC runtime SHALL give the child process the same resource configuration the embedded runtime
gives its session: skill, extension and prompt-template paths, their discovery switches, the tool
allowlist, and the system prompt. pi-outpost's own tools SHALL be available to the child, so an
agent does not lose them by changing runtime.

A configured sandbox SHALL NOT be silently unenforced. Because the sandbox is a replacement toolset
built in this process rather than a setting the agent obeys, selecting it together with the RPC
runtime SHALL fail at configuration load with an error naming both settings.

#### Scenario: RpcChildReceivesConfiguredResources
- **GIVEN** a configuration selecting `rpc` that also names skills, extensions, prompt templates and a tool allowlist
- **WHEN** pi-outpost starts the child
- **THEN** the child is launched with those resources, and with pi-outpost's own tools available to the agent

#### Scenario: SandboxWithRpcIsRefused
- **GIVEN** a configuration selecting `rpc` together with a sandbox
- **WHEN** the configuration is loaded
- **THEN** startup fails naming both settings rather than running the child with unconfined tools

### Requirement: DurableInteractiveConfiguration

The server SHALL preserve unrelated keys and formatting-compatible JSON data when it persists editable runtime settings to its loaded configuration file.

#### Scenario: Persist an interactive skill-path update
- **WHEN** an accepted settings update adds a skill path
- **THEN** the loaded configuration file contains that path under its user skill-path key and retains unrelated configuration values, including the file's own `skillPaths`

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
