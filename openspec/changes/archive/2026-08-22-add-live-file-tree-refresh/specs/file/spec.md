## ADDED Requirements

### Requirement: WatchListedDirectories

The system SHALL watch the contents of every directory it has listed for a client, and SHALL
notify connected clients when a watched directory's entries change on disk — whatever caused the
change, including a change made by no part of this process.

A directory SHALL become watched as a consequence of being listed successfully, and only then:
a directory that was never listed SHALL NOT be watched, and a listing that was refused SHALL NOT
register a watch.

Every path SHALL be resolved through the file browser's symlink-safe confinement before a watch
is opened, so no watch is ever held on a path outside the browser root.

Notifications SHALL be coalesced per directory into a window opened by the first change and not
extended by later ones, so that a directory under sustained modification is still reported while
it is being modified, and a burst of changes produces at most one notification per window.

The number of simultaneously watched directories SHALL be capped. When the cap is reached, the
least recently listed directory SHALL be dropped. Dropping a watch SHALL NOT be an error and the
directory SHALL become watched again if it is listed again.

Watchers SHALL NOT keep the process alive on their own.

When watching is disabled by configuration, no watch SHALL be opened and no notification of this
kind SHALL be sent; every other file-browser behaviour SHALL be unchanged.

#### Scenario: ExternalChangeIsAnnounced
- **GIVEN** a directory that has been listed
- **WHEN** an entry inside it is created, removed or renamed by something other than this server
- **THEN** connected clients are notified that this directory changed

#### Scenario: UnlistedDirectoryIsNotWatched
- **GIVEN** a directory inside the browser root that has never been listed
- **WHEN** an entry inside it changes on disk
- **THEN** no notification is sent for it

#### Scenario: RefusedListingRegistersNoWatch
- **WHEN** a listing is refused because the path is outside the root or does not exist
- **THEN** no watch is opened for it

#### Scenario: BurstIsCoalesced
- **GIVEN** a watched directory
- **WHEN** many entries change within one coalescing window
- **THEN** at most one notification is sent for that directory and that window

#### Scenario: SustainedChangeStillReports
- **GIVEN** a watched directory being modified continuously for longer than one window
- **THEN** notifications continue to arrive rather than being deferred until the changes stop

#### Scenario: LeastRecentlyListedIsEvicted
- **GIVEN** the maximum number of directories is already watched
- **WHEN** a further directory is listed
- **THEN** the least recently listed directory is no longer watched and the new one is

#### Scenario: WatchingDoesNotHoldTheProcessOpen
- **GIVEN** directories are being watched
- **WHEN** nothing else keeps the process alive
- **THEN** the process is free to exit

#### Scenario: WatchingDisabled
- **GIVEN** a configuration with file watching disabled
- **WHEN** a directory is listed and an entry inside it then changes on disk
- **THEN** the listing is returned as usual and no change notification is sent
