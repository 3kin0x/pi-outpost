## ADDED Requirements

### Requirement: CodeIntelligenceSetting

The configuration SHALL accept a `codeIntelligence` block governing the per-workspace
structural-analysis capability, with at least:

- an enablement mode of `auto`, `on` or `off`, defaulting to `auto`. `auto` offers the
  capability to a workspace whose project can be served and stays silent for one that cannot;
  `on` treats a workspace that cannot be served as a reportable failure rather than a quiet
  absence; `off` starts nothing for any workspace;
- an optional path to the analysis runtime to use, for an operator who wants a specific
  installation instead of the one the distribution supplies.

An invalid enablement mode SHALL make startup fail with an error naming
`codeIntelligence.mode`. A configured runtime path that does not exist SHALL NOT prevent the
server from starting: the capability SHALL be reported unavailable, naming that path, so that
one mistyped setting does not cost the operator every project.

The setting SHALL be server-wide, and SHALL apply to every workspace the server holds; it
SHALL NOT weaken any sandbox, workspace lock, or runtime capability check.

#### Scenario: AbsentMeansAuto
- **GIVEN** a configuration with no `codeIntelligence` block
- **WHEN** the server starts
- **THEN** the capability is in `auto`: a workspace whose project can be served gets it, and one that cannot is unaffected

#### Scenario: OffStartsNothing
- **GIVEN** a configuration with `codeIntelligence.mode` set to `off`
- **WHEN** workspaces are opened
- **THEN** no analysis runtime is started for any of them, and no structural tools are offered

#### Scenario: InvalidModeFailsAtStartup
- **GIVEN** a configuration with `codeIntelligence.mode` set to an unknown value
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming `codeIntelligence.mode`

#### Scenario: AMistypedRuntimePathDoesNotStopTheServer
- **GIVEN** a configuration naming an analysis runtime path that does not exist
- **WHEN** the server starts and a workspace is opened
- **THEN** the server starts and the workspace works
- **AND** its code intelligence is reported unavailable, naming the configured path
