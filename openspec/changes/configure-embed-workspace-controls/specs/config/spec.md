## ADDED Requirements

### Requirement: EmbedWorkspaceControlPolicy

The configuration SHALL accept `embed.workspaceControls` as one of `settings`,
`root`, or `projects`. When absent it SHALL default to `settings`, preserving the
single-project embedded interface. An invalid value SHALL make startup fail with
an error naming `embed.workspaceControls`.

The policy SHALL affect mounted widgets only; the standalone interface SHALL
retain its existing project controls. It SHALL not weaken sandbox locks, runtime
capability checks, or the server-wide workspace lock.

#### Scenario: SettingsModeIsTheDefault
- **GIVEN** a configuration without `embed.workspaceControls`
- **WHEN** the server starts
- **THEN** mounted widgets use `settings` mode

#### Scenario: ProjectsModeIsConfigured
- **GIVEN** a configuration with `embed.workspaceControls` set to `projects`
- **WHEN** a widget mounts against that server
- **THEN** the server reports that policy to the widget

#### Scenario: RootModeIsConfigured
- **GIVEN** a configuration with `embed.workspaceControls` set to `root`
- **WHEN** a widget mounts against that server
- **THEN** the server reports that policy to the widget

#### Scenario: InvalidEmbedWorkspaceControls
- **GIVEN** a configuration with `embed.workspaceControls` set to an unknown value
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming `embed.workspaceControls`

#### Scenario: PolicyDoesNotWeakenWorkspaceLock
- **GIVEN** a configuration enabling project controls for embeds and also enabling the server workspace lock
- **WHEN** a widget connects
- **THEN** the workspace lock remains effective

