# Change Proposal: Integrated Interactive Web Terminal

## Why

When deploying Pi Outpost on a remote server or headless Linux VM (e.g. Red Hat, Ubuntu) and connecting from a remote browser (e.g. Windows/macOS), the operator currently has to open and manage a separate SSH session or terminal to run manual commands, build scripts, or check system logs.

Integrating a full-featured interactive pseudo-terminal (PTY) directly into Pi Outpost:
- Eliminates the need for a separate SSH client.
- Automatically opens shells inside the active workspace (`cwd`).
- Leverages the existing authenticated WebSocket connection without requiring extra open ports or complex network configuration.
- Allows running interactive CLI and TUI tools (`htop`, `vim`, `git`, `npm`, etc.) alongside the agent.

## What

1. **Protocol & Shared Types (`@pi-outpost/shared`)**:
   - `terminal_open`: `{ terminalId: string, cwd?: string, cols?: number, rows?: number }`
   - `terminal_input`: `{ terminalId: string, data: string }`
   - `terminal_resize`: `{ terminalId: string, cols: number, rows: number }`
   - `terminal_close`: `{ terminalId: string }`
   - `terminal_data`: `{ terminalId: string, data: string }`
   - `terminal_exit`: `{ terminalId: string, exitCode?: number }`
   - `terminal_error`: `{ terminalId: string, message: string }`

2. **Backend PTY Management (`@pi-outpost/server`)**:
   - `TerminalManager`: Spawns interactive login shells (`bash -l`, `zsh -l`, `powershell.exe`) via `node-pty`.
   - Bounded by sandbox policy: requires `sandbox.allowBash: true` (or unconstrained server).
   - Multi-terminal session lifecycle per WebSocket client.

3. **Frontend Terminal UI (`@pi-outpost/ui`)**:
   - `@xterm/xterm` with `@xterm/addon-fit` and `@xterm/addon-web-links`.
   - Multi-tab support (`bash 1`, `bash 2`, `+` button).
   - Global keyboard shortcut `Ctrl+\`` / `Cmd+\`` to toggle panel visibility.
   - Header button `>_ terminal`.
   - Auto dark/light theme styling matching Pi Outpost theme.
