## Why

Settings currently apply sandbox changes only to the in-memory configuration, so they disappear when pi-outpost restarts. Operators also cannot select mounted server directories for skills or other path-valued settings from the UI, which makes remote deployments depend on manual JSON editing.

## What Changes

- Persist settings changes to the configuration file that the server loaded, preserving unrelated configuration.
- Let Settings add and remove its own server-side skill paths, held under `userSkillPaths`, while the configuration file's `skillPaths` and the built-in skills stay untouched.
- Add a reusable server filesystem explorer for path-valued settings, starting with skill paths and sandbox paths.
- Restart the agent session after applying resource or sandbox changes so the effective skill/tool inventory matches persisted configuration.
- Give an accepted Settings update precedence over startup flag and environment overrides for the runtime settings it manages.

## Capabilities

### New Capabilities

- `server-path-selection`: Browse mounted server directories and select paths for configurable runtime resources.
- `persistent-runtime-settings`: Persist operator-managed sandbox and skill-path settings and reload the agent session from them.

### Modified Capabilities

- `components`: SettingsMenu presents editable runtime resource paths and reports selection and apply requests through callbacks.
- `config`: The loaded configuration file remains the durable source of truth when supported settings are changed through the UI.
- `model`: The WebSocket protocol carries path-browsing and persisted-runtime-settings requests and state.

## Impact

- `ui/src/components/SettingsMenu.tsx`, `ui/src/useAgent.ts`, and `ui/src/App.tsx`
- `shared/src/protocol.ts`
- `server/src/index.ts`, `server/src/config.ts`, and a server-side directory-listing boundary distinct from the workspace file browser
- Configuration files containing `skillPaths`, `userSkillPaths` and sandbox settings
