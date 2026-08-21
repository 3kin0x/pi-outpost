## Purpose

Lets an operator select directories mounted on the pi-outpost host for runtime configuration without manually discovering server-side paths.

## ADDED Requirements

### Requirement: Browse server directories
The system SHALL let an authenticated connected client request the immediate directories beneath any server-side path readable by the pi-outpost process and select one as a configuration value. Exploration SHALL start at the filesystem root — `/`, or the current drive's root on Windows — and SHALL not impose an additional path-root restriction.

#### Scenario: Browse a mounted skills share
- **WHEN** the user explores from the filesystem root to a mounted server directory containing a skills folder
- **THEN** the UI presents its child directories and returns the selected server path

#### Scenario: Refuse an unreadable path
- **WHEN** the client requests a path that cannot be listed by the server
- **THEN** the UI receives an error naming that path and the current setting remains unchanged
