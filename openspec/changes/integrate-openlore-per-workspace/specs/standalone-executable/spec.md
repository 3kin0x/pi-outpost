## MODIFIED Requirements

### Requirement: AnExecutableSaysWhatItCarries

A standalone executable SHALL contain the server and the built web interface, and
SHALL serve the interface from inside itself with nothing beside it on disk.

It SHALL additionally carry the code-intelligence runtime, at a version the build pins, so
that a machine with no Node runtime and no separate installation of that runtime still gets
the capability. It SHALL run that runtime with the runtime the executable already carries
wherever that is technically possible, rather than requiring a second one on the machine, and
SHALL require no Model Context Protocol server, configuration or installation step from the
person who downloaded it. The analysis runtime SHALL remain an independently versioned
dependency of the distribution: it is carried, not absorbed, and no part of it is copied into
this project's source.

Where the carried runtime needs files on disk to work, the executable SHALL provide them
itself, in a location it owns, without the operator supplying or arranging anything. Where that
runtime needs a component built for one platform, the executable for that platform SHALL carry
that platform's component, and a build that cannot obtain it SHALL fail rather than produce an
executable whose capability breaks only at run time.

What the carried runtime can do SHALL NOT be a subset discovered by use. Searching the project's
code and specifications is part of the capability, so the executable SHALL carry what searching
requires. Anything deliberately left out SHALL be stated in the documentation alongside what its
absence costs, and SHALL surface at run time as a named, actionable reason rather than a silently
poorer answer.

What it does not carry SHALL be stated rather than discovered: the bundled skills
live on the filesystem and are not embedded, so an executable starts without them
unless it is pointed at a directory holding them. This degrades rather than breaks —
the tools work; what is missing is the instruction that makes a producer's first
attempt valid.

#### Scenario: TheInterfaceIsInside
- **GIVEN** an executable alone in an empty directory
- **WHEN** it is run
- **THEN** it serves the web interface without any other file being present

#### Scenario: SkillsAreAbsentAndSaidToBe
- **WHEN** an executable runs with no skills directory configured
- **THEN** it starts and works, and the documentation states that the bundled skills are not inside it and how to supply them

#### Scenario: CodeIntelligenceOnAMachineWithNothingInstalled
- **GIVEN** a machine with no Node runtime and no analysis runtime installed
- **WHEN** the operator downloads the executable, runs it and opens a project
- **THEN** that workspace's code intelligence starts and becomes ready
- **AND** the operator installed and configured no Model Context Protocol server

#### Scenario: SearchWorksOutOfTheExecutable
- **GIVEN** a project opened in a standalone executable whose code intelligence is ready
- **WHEN** the agent searches the project's code or specifications
- **THEN** it receives results, with nothing installed beside the executable

#### Scenario: ABuildWithoutItsPlatformComponentFails
- **GIVEN** a release build for a platform whose required component cannot be obtained
- **WHEN** the build runs
- **THEN** it fails, naming what is missing, and publishes no executable for that platform

#### Scenario: TheCarriedVersionIsStated
- **WHEN** an executable is asked what it carries
- **THEN** the version of the analysis runtime built into it is named, distinctly from pi-outpost's own version
