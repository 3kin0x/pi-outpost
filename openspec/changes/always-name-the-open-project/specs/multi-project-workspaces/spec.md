## ADDED Requirements

### Requirement: AlwaysNameTheProjectOnScreen

The interface SHALL always name the project it is showing, in the same control and the
same place, whatever the number of projects open — one included. The server SHALL
therefore describe the bound project and list the open projects on every snapshot,
without a threshold.

A selector's first job is to say where the user is; choosing is its second. With one
project open only the first remains, and it is the one that matters most — a user who
cannot see which project they are in cannot trust anything else on the screen.

Opening a second project SHALL add a choice to that control, not replace it with a
different one: the interface SHALL NOT change shape as the number of open projects
crosses any threshold.

Where a control is not offered at all — a pinned server, or a mounted widget whose
policy withholds it — this requirement adds nothing: it governs what the control says
when there is one, never whether there is one.

#### Scenario: OneProjectIsStillNamed
- **GIVEN** a server with exactly one open project
- **WHEN** a client connects
- **THEN** the interface names that project, with its state, in the workspace control

#### Scenario: TheControlDoesNotChangeShape
- **GIVEN** a client showing one open project
- **WHEN** a second project is opened
- **THEN** the same control, in the same place, now offers the choice between them
- **AND** nothing about naming the current project has changed

#### Scenario: OpeningStaysReachableFromTheControl
- **GIVEN** a server with exactly one open project
- **WHEN** the user looks for a way to open another
- **THEN** the workspace control offers it

#### Scenario: APinnedServerStillOffersNothing
- **GIVEN** a configuration that pins the server to one project
- **WHEN** a client connects
- **THEN** no workspace control is offered, and no project is named by one
