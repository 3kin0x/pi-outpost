## ADDED Requirements

### Requirement: PrereleasesAreNotWhatAnInstallationIsOffered

A prerelease SHALL be published so that it does not become what an update check
offers, and SHALL be marked as a prerelease wherever releases are listed. Which
channel a version is published to SHALL be derived from the version itself, so that a
release cannot reach the default channel by a prerelease's route, or the reverse,
through anyone forgetting to say which it is.

An operator SHALL be able to install a prerelease deliberately, by asking for it.

#### Scenario: APrereleaseDoesNotMoveTheDefaultChannel
- **GIVEN** a published prerelease newer than every release
- **WHEN** an existing installation checks for an update
- **THEN** it is told it is on the newest published version
- **AND** the prerelease is not offered

#### Scenario: AReleaseStillMovesIt
- **GIVEN** a published release newer than every other
- **WHEN** an existing installation checks for an update
- **THEN** the release is offered

#### Scenario: TheChannelComesFromTheVersion
- **WHEN** a version is published
- **THEN** the channel it goes to is decided by whether that version is a prerelease, not by a separate instruction that could disagree with it

#### Scenario: APrereleaseIsListedAsOne
- **WHEN** a prerelease is published
- **THEN** it is marked as a prerelease where releases are listed, rather than shown as the current one

#### Scenario: AskingForItInstallsIt
- **GIVEN** a published prerelease
- **WHEN** an operator asks for that channel by name
- **THEN** the prerelease is what they install
