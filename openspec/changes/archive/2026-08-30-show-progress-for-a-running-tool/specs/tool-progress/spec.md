## Purpose

Lets a long-running tool report how far along it is, carries that completion fraction from the tool to every connected client, and shows it as a determinate progress bar on the tool card while the tool runs.

## ADDED Requirements

### Requirement: A running tool can report a completion fraction

While a tool executes, it MAY report a completion fraction as often as it chooses. A reported fraction SHALL be a number from `0` (not started) to `1` (complete) and SHALL carry no label or unit — the tool card already shows the streamed detail. The fraction rides on the partial results the tool already emits during execution; a tool that emits no fraction is reporting no progress, which is the default.

#### Scenario: A tool reports its progress partway through

- **GIVEN** a tool that has begun executing
- **WHEN** it emits a partial result carrying a completion fraction of `0.4`
- **THEN** that fraction is delivered toward the clients as the tool's current progress

#### Scenario: A tool emits partial output but no fraction

- **GIVEN** a running tool that streams text updates
- **WHEN** none of its updates carries a completion fraction
- **THEN** the tool is treated as reporting no progress, exactly as tools do today

### Requirement: The fraction reaches every client watching the workspace

A reported fraction SHALL be delivered to every client subscribed to the workspace whose agent is running the tool, on the same stream of tool updates that already carries the tool's partial output. Whichever runtime is executing the agent SHALL forward it; the fraction SHALL NOT be delivered to clients of another workspace.

#### Scenario: Two clients watch the same running tool

- **GIVEN** two clients subscribed to the same workspace
- **WHEN** the running tool reports a completion fraction
- **THEN** both clients receive that fraction for that tool call

#### Scenario: Another workspace is unaffected

- **GIVEN** a tool reporting progress in workspace A
- **WHEN** a client is subscribed only to workspace B
- **THEN** that client receives no progress for A's tool call

### Requirement: Invalid or out-of-range fractions never fault and never display as given

A fraction below `0` or above `1` SHALL be clamped into that range before it reaches a client. A value that is not a finite number — a non-number, `NaN`, or an infinity — SHALL be ignored for that update, leaving the tool's progress unchanged rather than faulting the update or the turn. A fraction that is lower than one already reported SHALL be delivered as given; progress is not required to move only forward.

#### Scenario: A fraction outside the range

- **WHEN** a tool reports a completion fraction of `1.7`
- **THEN** clients receive `1` for that tool call

#### Scenario: A fraction that is not a finite number

- **GIVEN** a tool that has reported a fraction of `0.5`
- **WHEN** its next update carries `NaN` as the fraction
- **THEN** the update is still delivered, the tool's progress stays at `0.5`, and no error is raised

#### Scenario: A fraction that decreases

- **GIVEN** a tool that has reported `0.8`
- **WHEN** it reports `0.3`
- **THEN** clients receive `0.3` for that tool call

### Requirement: The client shows a determinate bar only while the tool runs and only after a fraction has arrived

The tool card SHALL show a determinate progress bar for a tool call when that call is still running and at least one completion fraction has been received for it. Before the first fraction there SHALL be no bar. If a later update for a running tool carries no fraction, the most recently received fraction SHALL remain shown. When the tool call ends — whether it succeeds or fails — the bar SHALL be removed. The bar is independent of whichever presentation renders the tool's output.

#### Scenario: The first fraction arrives

- **GIVEN** a running tool whose card shows no progress bar
- **WHEN** the client receives a completion fraction of `0.25` for it
- **THEN** the card shows a determinate progress bar at one quarter

#### Scenario: A later update omits the fraction

- **GIVEN** a running tool whose card shows a bar at `0.25`
- **WHEN** the client receives a further text update for it with no fraction
- **THEN** the bar stays at `0.25`

#### Scenario: The tool finishes

- **GIVEN** a running tool whose card shows a progress bar
- **WHEN** the tool call ends, with or without an error
- **THEN** the card no longer shows a progress bar and shows the tool's result

#### Scenario: The bar shows wherever the tool card shows

- **GIVEN** the tool card rendered inside the embeddable widget
- **WHEN** a running tool reports a completion fraction
- **THEN** the widget shows the same determinate progress bar as the full interface

### Requirement: The completion fraction is not persisted

A completion fraction SHALL NOT be written to session history. A client that connects or reconnects while a tool is running SHALL show no progress bar for that tool until it receives a further update carrying a fraction. A tool call reconstructed from history SHALL show no progress bar.

#### Scenario: A client reconnects mid-run

- **GIVEN** a tool that reported progress and is still running
- **WHEN** a client connects and its view is rebuilt from session history
- **THEN** that tool's card shows no progress bar until the next fraction arrives

#### Scenario: A finished tool in history

- **WHEN** the conversation is rebuilt from history and a tool call in it has already completed
- **THEN** its card shows no progress bar
