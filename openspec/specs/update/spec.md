## Purpose

Lets an operator find out that a newer pi-outpost exists and move to it, without having to know how their copy was installed or which command that installation needs.

## Requirements

### Requirement: UpdateReportsWhatIsAvailable

The system SHALL provide a command that reports the running version, the newest published version, and whether an upgrade is available, without modifying anything.

It SHALL resolve the newest version from the package registry. When the registry cannot be reached, the command SHALL report that it could not check, name the reason, and exit non-zero — a failed check SHALL NOT be reported as "up to date".

#### Scenario: CheckFindsANewerVersion
- **GIVEN** the running version is older than the newest published one
- **WHEN** the operator runs the check
- **THEN** it prints both versions, states that an upgrade is available, and changes nothing on disk

#### Scenario: CheckFindsNothingNewer
- **GIVEN** the running version is the newest published one
- **WHEN** the operator runs the check
- **THEN** it says so and exits zero

#### Scenario: CheckCannotReachTheRegistry
- **WHEN** the registry is unreachable
- **THEN** the command reports that the check failed and why, and does not claim the installation is current

#### Scenario: TheCheckOutlivesNothingButItselfIsNotCutShort
- **GIVEN** the check is the only work the process has left, and the request is the real one rather than an injected fake
- **WHEN** the registry answers, or fails to
- **THEN** the command prints a verdict either way and exits with its own code — the process SHALL NOT drain while the check is in flight, which would produce no output and an exit code belonging to the runtime

### Requirement: UpdateActsOnTheRunningInstallation

The system SHALL determine which installation the running process belongs to, and SHALL act only on that one. It MUST NOT run an installation command whose effect would land somewhere other than the copy being executed.

Before installing, the command SHALL print the exact command it is about to run.

For an installation it cannot upgrade itself, the command SHALL refuse and SHALL name the action the operator should take instead. Refusing SHALL exit non-zero.

#### Scenario: UpgradesAGlobalPackageInstall
- **GIVEN** pi-outpost is running from a globally installed package
- **WHEN** the operator runs the update command
- **THEN** it prints the install command, runs it, and reports the version it moved to

#### Scenario: RefusesToUpgradeARepositoryCheckout
- **GIVEN** pi-outpost is running from a source checkout
- **WHEN** the operator runs the update command
- **THEN** it refuses, explains that the copy is a working tree, and names the version-control command instead of installing a second copy elsewhere

#### Scenario: ExplainsThatAnEphemeralRunIsAlreadyCurrent
- **GIVEN** pi-outpost is running through a one-off package runner that fetches on every invocation
- **WHEN** the operator runs the update command
- **THEN** it explains that the next run already fetches the newest version, and installs nothing

#### Scenario: RefusesToReplaceASelfContainedExecutable
- **GIVEN** pi-outpost is running as a single-file executable
- **WHEN** the operator runs the update command
- **THEN** it refuses to replace the running file and points at where a newer build is published

### Requirement: UpdateNeverInstallsWithoutBeingAsked

The system SHALL install a new version only when the operator invokes the update command without the check-only flag. No other code path SHALL install, replace, or download an executable.

#### Scenario: CheckOnlyInstallsNothing
- **WHEN** the operator runs the check-only form
- **THEN** nothing is installed, downloaded, or replaced, whatever the outcome of the check

#### Scenario: StartupNeverInstalls
- **GIVEN** a newer version exists
- **WHEN** the server starts
- **THEN** it may say so, and SHALL NOT install anything

### Requirement: StartupNoticeIsNonBlocking

The system SHALL be able to tell the operator at startup that a newer version exists. That notice SHALL NOT delay startup: the check SHALL begin only after the server is accepting connections, SHALL NOT be awaited, and SHALL NOT keep the process alive when it would otherwise exit.

The result SHALL be cached, and a cached result newer than the configured interval SHALL be used instead of querying the registry again.

The notice SHALL be silent when the running version is current, and silent when the check fails.

#### Scenario: StartupIsNotDelayedByTheCheck
- **GIVEN** the registry is slow or unresponsive
- **WHEN** the server starts
- **THEN** it accepts connections at the same point it would without the check

#### Scenario: PendingCheckDoesNotHoldTheProcessOpen
- **GIVEN** a check is still in flight
- **WHEN** the operator stops the server
- **THEN** the process exits without waiting for the request to settle

#### Scenario: RepeatedStartsDoNotRepeatTheQuery
- **GIVEN** a check ran within the caching interval
- **WHEN** the server starts again
- **THEN** it uses the cached answer and makes no registry request

#### Scenario: FailedCheckSaysNothingAtStartup
- **WHEN** the startup check fails for any reason
- **THEN** the server logs nothing about updates and starts normally

### Requirement: UpdateCheckingIsSeparableFromOfflineOperation

Offline operation SHALL turn update checking off by default, because a host that cannot reach the network is not helped by a request that hangs. It SHALL NOT be a veto: enabling update checking explicitly SHALL re-enable it even under offline operation.

The two settings describe different networks. `offline` states that remote model catalogs are unreachable; a deployment can be air-gapped from those and still reach a package registry through an internal proxy. A rule that conflated them would forbid exactly the case that needs checking most — an isolated host, updated rarely, where knowing a release exists matters.

Update checking disabled on its own SHALL suppress every update-related request regardless of offline operation.

A source checkout SHALL NOT be compared against the registry at startup, because a working tree has no published version to be behind.

#### Scenario: OfflineSuppressesTheStartupCheckByDefault
- **GIVEN** offline operation is configured and update checking is not mentioned
- **WHEN** the server starts
- **THEN** no registry request is made

#### Scenario: ExplicitCheckingSurvivesOfflineOperation
- **GIVEN** offline operation is configured and update checking is explicitly enabled
- **WHEN** the server starts
- **THEN** the update check runs, while remote model catalogs remain unfetched

#### Scenario: DisabledCheckingWinsRegardlessOfOffline
- **GIVEN** update checking is explicitly disabled and offline operation is not configured
- **WHEN** the server starts
- **THEN** no registry request is made

#### Scenario: CheckCommandRefusesRatherThanHanging
- **GIVEN** update checking is disabled by configuration
- **WHEN** the operator runs the check command
- **THEN** it reports which setting disabled it instead of attempting a request

#### Scenario: CheckoutIsNotComparedAtStartup
- **GIVEN** pi-outpost is running from a source checkout
- **WHEN** the server starts
- **THEN** no registry request is made and no notice is printed

### Requirement: UpdateChecksUseTheConfiguredRegistry

The system SHALL query the package registry the host is configured to use, rather than a fixed public address. It SHALL take the registry from the package manager's own configuration when one is set, SHALL accept an explicit override in pi-outpost's configuration, and SHALL fall back to the public registry when neither names one.

An installation performed by the command SHALL go through the package manager. Where the registry came from the package manager's own configuration, the command SHALL NOT restate it. Where pi-outpost's configuration overrode it, the command SHALL name that registry to the installer, so that the registry an update is announced from is the one it is installed from.

#### Scenario: UsesThePackageManagerRegistry
- **GIVEN** the package manager is configured with an internal registry proxy
- **WHEN** an update check runs
- **THEN** the request goes to that registry, not to the public one

#### Scenario: ConfiguredOverrideWins
- **GIVEN** pi-outpost's configuration names a registry
- **WHEN** an update check runs
- **THEN** that address is used in preference to the package manager's

#### Scenario: TheInstallUsesTheRegistryTheCheckUsed
- **GIVEN** pi-outpost's configuration names a registry the package manager does not
- **WHEN** the command installs a newer version
- **THEN** the installer is pointed at that same registry, rather than resolving a different one

#### Scenario: FallsBackToThePublicRegistry
- **GIVEN** neither the package manager nor pi-outpost names a registry
- **WHEN** an update check runs
- **THEN** the public registry is used
