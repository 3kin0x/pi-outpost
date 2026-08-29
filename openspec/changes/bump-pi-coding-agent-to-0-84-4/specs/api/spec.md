## ADDED Requirements

### Requirement: TheSnapshotNamesWhatAnswersPrompts

The state snapshot SHALL name what is answering prompts for the connection: the pi SDK
running in this process, or the supervised child when one serves the conversation —
exactly one of the two, never both.

Where that version can be established it SHALL be reported, whatever shape the server
was started in. A placeholder standing in for "not known" SHALL be sent only when the
version genuinely cannot be read, and SHALL never be a version number the server did
not establish: an operator acting on a version that is wrong is worse off than one
told nothing.

#### Scenario: ADistributedBuildNamesItsSdk
- **GIVEN** a server running from a self-contained executable
- **WHEN** a client connects
- **THEN** the snapshot names the pi SDK version that was built into it

#### Scenario: ARunFromSourceNamesItToo
- **GIVEN** a server started from source, with the SDK installed alongside it
- **WHEN** a client connects
- **THEN** the snapshot names that installed SDK's version
- **AND** it is not the placeholder

#### Scenario: AnUnreadableVersionIsNotInvented
- **GIVEN** a server that cannot read the installed SDK's version
- **WHEN** a client connects
- **THEN** the snapshot carries the placeholder rather than a version the server guessed at

#### Scenario: AChildIsNamedInsteadOfTheSdk
- **GIVEN** a server whose conversation is served by a supervised agent child
- **WHEN** a client connects
- **THEN** the snapshot names that child, and does not also name an SDK version
