## MODIFIED Requirements

### Requirement: CliFlags

The binary SHALL accept `--config <path>`, `--profile <name>`, `--cwd <dir>`, `--agent-dir <dir>`, `--port <n>`, `--host <addr>`, `--help` and `--version`. Relative paths given on the command line SHALL be resolved against the current directory (paths inside a config file remain relative to that file). The binary SHALL NOT accept a flag carrying the auth token. An unknown flag SHALL be an error that names the flag and points at `--help`.

The binary SHALL additionally accept an `update` subcommand, and a `--check` flag that applies to it. `--check` outside that subcommand SHALL be an error like any other misplaced flag, rather than being silently ignored.

#### Scenario: HelpListsEveryFlag
- **WHEN** the user runs `pi-outpost --help`
- **THEN** it prints every flag, the config discovery order, and exits zero

#### Scenario: UnknownFlag
- **WHEN** the user runs `pi-outpost --porte 8080`
- **THEN** it exits non-zero, names the unknown flag, and suggests `--help`

#### Scenario: VersionMatchesThePackage
- **WHEN** the user runs `pi-outpost --version`
- **THEN** it prints the version of the installed package

#### Scenario: HelpDocumentsTheUpdateCommand
- **WHEN** the user runs `pi-outpost --help`
- **THEN** the `update` subcommand and its `--check` flag appear alongside the other commands
