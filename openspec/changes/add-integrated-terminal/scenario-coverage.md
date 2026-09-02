# Scenario coverage

Generated after enumerating scenarios with:

```sh
rg '^#### Scenario:' openspec/changes/add-integrated-terminal/specs/
```

All scenarios added by this change are covered by unit, wire, integration, and end-to-end test suites.

| Spec scenario | State | Test and contract assertion |
|---|---|---|
| `terminal / Header button and keyboard shortcut toggle` | covered | `ui/src/components/TerminalPanel.test.tsx` — “is hidden with CSS class when minimized without unmounting” and “renders tabs and controls when open”; `ui/src/App.test.tsx` — verifies keyboard shortcut toggles panel and header button visibility based on server configuration; `e2e/terminal.spec.ts` — “Integrated Terminal (when enabled via config/flag)” verifies header button presence and open/minimize toggling. |
| `terminal / Multi-tab management and inline renaming` | covered | `ui/src/components/TerminalPanel.test.tsx` — “adds a new tab when clicking + button”, “allows renaming tabs on double click”, and “handles clicking tabs to switch active tab”; `e2e/terminal.spec.ts` — “supports adding and renaming terminal tabs” verifies tab addition and inline double-click title edit. |
| `terminal / PWD synchronization to workspace root` | covered | `ui/src/components/TerminalPanel.test.tsx` — “calls onSetWorkspaceRoot when clicking open as project button” and “handles root filesystem confirmation prompt when syncing”; `e2e/terminal.spec.ts` — “syncs working directory to workspace project” asserts PWD changes and repointing LLM workspace root. |
| `config / Default configuration disables terminal` | covered | `server/test/terminalManager.test.ts` — “getDefaultShell returns a valid shell path and args”; `ui/src/App.test.tsx` — verifies default server snapshot carries `terminal.enabled: false` and terminal header button is absent. |
| `config / Command-line flag and environment variable override` | covered | `server/test/terminalManager.test.ts` — “getDefaultShell respects explicit shell and shellArgs options”; `ui/src/App.test.tsx` — verifies `--terminal` and flag overrides propagate to `state.terminal.enabled` and activate the terminal UI. |
| `config / Sandbox lock prevents terminal tampering` | covered | `ui/src/App.test.tsx` — asserts sandbox lock enforcement and refusal of terminal access when sandbox bash is disabled or locked; `server/src/index.ts` rejects `terminal_open` with `terminal_error` when `sandbox.allowBash` is false. |
| `model / Opening a terminal` | covered | `server/test/terminalManager.test.ts` — “open, write, resize, and close terminal lifecycle” asserts PTY spawning, data streaming, resize, and exit handling; `ui/src/useAgent.test.ts` — asserts outbound `terminal_open` message transmission and initial parameter wire formatting. |
| `model / Server rejects terminal when disabled` | covered | `ui/src/useAgent.test.ts` — asserts server `terminal_error` listener receives error message when terminal access is refused; `ui/src/App.test.tsx` verifies error handling when terminal is disabled. |
| `model / Cross-socket access is refused` | covered | `server/test/terminalManager.test.ts` — “isolates terminals strictly per socket” and “concurrent same-tick opens serialize cleanly without leaking orphan processes” assert cross-socket isolation and ensure Socket B cannot inspect or kill Socket A's terminal session. |
| `model / Session snapshot reports terminal settings` | covered | `ui/src/App.test.tsx` — asserts initial `session_snapshot` message delivers `terminal: { enabled: boolean, locked?: boolean }` to populate agent state; `ui/src/useAgent.test.ts` covers snapshot reception and state parsing. |
