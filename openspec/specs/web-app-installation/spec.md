# Web App Installation Specification

## Purpose

What the standalone web interface declares about itself so a browser can install it as an app, what the installed window then shows, and what installation deliberately leaves unchanged.

## Requirements

### Requirement: DeclareTheAppToTheBrowser

The standalone interface SHALL serve a web app manifest, linked from the page it serves, declaring at least a name, a short name, a start URL, `display: standalone`, a background colour, a theme colour, and icons. The manifest SHALL be served with a manifest content type; served as an opaque byte stream it is ignored, and the interface is then not installable while appearing to declare that it is.

The manifest and its icons SHALL be reachable by every means the interface is served — from the built assets on disk, and from the assets inlined into the standalone executable — so that installability does not depend on how a deployment was installed.

#### Scenario: TheBrowserIsOfferedTheApp
- **GIVEN** the standalone interface served at a secure origin
- **WHEN** a browser loads the page
- **THEN** it finds a linked manifest declaring the app's name, start URL, standalone display and icons
- **AND** the browser offers to install the interface as an app

#### Scenario: TheManifestCarriesItsOwnContentType
- **WHEN** the manifest is requested
- **THEN** it is served as a manifest, not as an opaque byte stream

#### Scenario: InstallableFromTheStandaloneExecutable
- **GIVEN** a deployment running from the standalone executable, with no web directory on disk beside it
- **WHEN** a browser loads the interface
- **THEN** the manifest and every icon it names are served
- **AND** the interface is installable exactly as it is from a built directory

#### Scenario: IconsCoverAnInstalledApp
- **WHEN** the manifest is read
- **THEN** it names icons at the sizes an installed app is presented at, including one declared maskable, so a platform that crops an icon to its own shape does not cut into the artwork

### Requirement: RunInItsOwnWindow

An installed app SHALL open the interface in its own window, at the interface's own start URL, carrying the app's name and icon rather than a browser tab's. The installed window SHALL be the same interface, connecting to the same server, with the same session history: installation changes where the interface runs, never what it is.

#### Scenario: TheInstalledWindowIsTheInterface
- **GIVEN** the interface installed as an app
- **WHEN** the user opens it from their desktop or taskbar
- **THEN** it opens in its own window, without browser tabs or an address bar
- **AND** it connects to the same server and shows the same sessions as the browser tab did

#### Scenario: InstallationChangesNoBehaviour
- **GIVEN** the interface open in a browser tab and the same interface open as an installed app
- **WHEN** the same action is taken in each
- **THEN** both behave identically — installation adds no capability and removes none

### Requirement: RequireTheServerAsBefore

Installation SHALL NOT imply that the interface works without its server. The interface SHALL make no attempt to serve itself from a local cache: an installed app that cannot reach its server SHALL fail the way the browser tab does, rather than presenting a stale copy of a previous build.

#### Scenario: NoStaleBuildAfterAnUpdate
- **GIVEN** an installed app, and a server updated to a newer build
- **WHEN** the user opens the installed app
- **THEN** it loads the build the server is serving, not one cached from before the update

#### Scenario: NoServerNoSession
- **GIVEN** an installed app whose server is not running
- **WHEN** the user opens it
- **THEN** it reports that it cannot reach the server
- **AND** it does not present a conversation, file tree or session list from a previous run

### Requirement: ClaimNothingOnAHostPage

A mounted widget SHALL make no installability claim on the page that embeds it: it SHALL NOT link a manifest, and SHALL NOT alter the host page's own name, icon, theme colour or installability. Which app a host page is, and whether it can be installed, is the host's decision.

#### Scenario: TheHostPageIsUnchanged
- **GIVEN** a host page with its own manifest
- **WHEN** the widget is mounted into it
- **THEN** the host page's manifest, name, icon and installability are exactly as they were

#### Scenario: TheWidgetAddsNoManifest
- **GIVEN** a host page with no manifest of its own
- **WHEN** the widget is mounted into it
- **THEN** the page is still not installable — the widget has not made the host page into pi-outpost
