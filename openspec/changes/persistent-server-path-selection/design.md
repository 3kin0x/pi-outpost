## Context

See proposal.md. Settings currently carry only sandbox fields over WebSocket and `handleUpdateConfig` mutates the live `AppConfig`; it does not write the loaded JSON file. The workspace file browser is intentionally confined to the agent workspace, while mounted resource directories can be outside it.

## Goals / Non-Goals

**Goals:**

- Give Settings a server-side directory browser reusable by each editable path field.
- Make added skill directories durable and load them with built-in skills.
- Make applying settings atomic from the user's perspective: persist, then replace the session, then acknowledge.

**Non-Goals:**

- Uploading skills from the browser client.
- Browsing arbitrary server files or editing configuration text.
- Changing paths protected by existing locks.

## Decisions

### Add an unrestricted resource-path browser separate from the workspace file browser

The server will expose a directory-only browsing operation beginning at `/` and allowing every path readable by the pi-outpost process. It will not reuse the workspace browser because that browser's sandbox confinement would hide valid mounted shares, and weakening that confinement would expose workspace file operations beyond their contract. The UI will use one reusable picker component for every Settings path input. Existing WebSocket authentication is the access boundary.

### Persist a narrow editable configuration projection

The protocol will submit the editable sandbox fields plus `userSkillPaths`. The server will validate and merge locked values, record accepted UI-managed values separately from startup sources, write the loaded JSON configuration atomically, then rebuild the runtime. It will preserve unrelated top-level settings. The UI-managed values take precedence for these fields on later starts, preventing flags or environment variables from silently undoing an acknowledged Settings change.

### Separate the user's skill paths from the deployment's

Skill paths reach the session from two places, and only one of them is the user's. The configuration file's `skillPaths` belong to whoever wrote that file: a settings apply must never rewrite or remove one, because that would take a skill away from everyone who connects. The paths added from Settings are held under their own key, `userSkillPaths`, which is the only list the protocol carries as editable and the only one the server writes. Both are loaded, the file's first, so a name collision resolves in favour of the deployment.

The settings menu shows the user's list alone, under "User skill paths". The file's paths are not listed there — they are not a setting anyone can act on from the browser, and the skills they bring in are already visible in the loaded-skills inventory.

### Treat built-in skills as immutable inventory

The UI will list built-in skills from the runtime inventory. It will never write built-ins into any skill-path list or offer their removal.

### A virtual root, because Windows has no single one

Exploration starts at the top and walks down. On POSIX that top is `/`. On Windows
every drive has its own root and they do not connect — `dirname("C:\\")` is
`C:\\` — so walking up would dead-end on whichever drive the server happens to
have been started from. Since skill paths are chosen entirely by picker, with no
text field to type another drive into, that would put a directory on `D:` out of
reach altogether.

So `/` on Windows names a *virtual* root whose entries are the drives, and a drive
root's parent is that virtual root. Drive letters are probed by trying to open
them, skipping `A:` and `B:` — touching a floppy controller costs seconds and
nothing anyone configures lives there. POSIX is untouched: `/` is a real directory
and its parent is nothing.

## Risks / Trade-offs

- [An unrestricted explorer exposes readable host topology] → retain the existing WebSocket authentication boundary and return directory names only; operators accept this visibility for authenticated clients.
- [A malformed config update could make the next boot fail] → validate the merged configuration before atomic replacement and retain the original file on error.
- [A resource reload can interrupt work] → reject while a session replacement is already in progress and acknowledge only after a healthy replacement snapshot.

## Migration Plan

Existing configurations require no migration: an absent `userSkillPaths` remains an empty list, `skillPaths` keeps its meaning, and built-ins keep loading. Rollback consists of restoring the previous configuration file; atomic replacement retains it until the new file is validated.
