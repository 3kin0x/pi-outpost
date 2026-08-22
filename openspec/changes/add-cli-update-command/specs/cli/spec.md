## MODIFIED Requirements

### Requirement: CliFlags

The binary SHALL accept `--config <path>`, `--profile <name>`, `--cwd <dir>`, `--agent-dir <dir>`, `--port <n>`, `--host <addr>`, `--help` and `--version`. Relative paths given on the command line SHALL be resolved against the current directory (paths inside a config file remain relative to that file). The binary SHALL NOT accept a flag carrying the auth token. An unknown flag SHALL be an error that names the flag and points at `--help`.

The binary SHALL additionally accept a `build-exe` subcommand, and `--out <path>` and `--force` flags that apply to it. It SHALL accept `--open` and `--no-open`, which decide whether starting the server launches a browser, and which apply wherever the server starts rather than to any one subcommand. A flag given outside the subcommand it belongs to SHALL be an error like any other misplaced flag, rather than being silently ignored.

The binary SHALL additionally accept an `update` subcommand, and a `--check` flag that applies to it, subject to the same rule.

#### Scenario: HelpListsEveryFlag
- **WHEN** the user runs `pi-outpost --help`
- **THEN** it prints every flag, the config discovery order, and exits zero

#### Scenario: UnknownFlag
- **WHEN** the user runs `pi-outpost --porte 8080`
- **THEN** it exits non-zero, names the unknown flag, and suggests `--help`

#### Scenario: VersionMatchesThePackage
- **WHEN** the user runs `pi-outpost --version`
- **THEN** it prints the version of the installed package

#### Scenario: HelpDocumentsTheBuildCommand
- **WHEN** the user runs `pi-outpost --help`
- **THEN** the `build-exe` subcommand, its options, and the browser-opening flags appear alongside the other commands

#### Scenario: HelpDocumentsTheUpdateCommand
- **WHEN** the user runs `pi-outpost --help`
- **THEN** the `update` subcommand and its `--check` flag appear alongside the other commands
