## Why

The file tree only refreshes when the server itself made the change, and only for two of the
ways it can make one. `announceFileChange` (server/src/index.ts) runs off `tool_end`, and
`tool_start` only records a pending mutation for the `edit` and `write` tools. Everything else
leaves the tree stale:

- an agent that moves, copies or deletes through **`bash`** — the server never learns a path changed;
- an **extension tool** that writes to disk without going through `edit`/`write`;
- anything done **outside the process entirely**: a file moved in Finder or Explorer, a
  `git checkout`, an editor saving next to us.

There is no filesystem watcher anywhere in the server — the only `file_changed` broadcasts are
the ones the server emits about its own actions. The user's way out today is to collapse and
re-expand the directory, or reload the page. A workspace browser that lies about what is in the
workspace is worse than no browser: the agent is told to read a file the tree does not show, and
the file the tree does show is not there any more.

## What Changes

- **A directory watcher on the server**, over exactly the directories a client has listed —
  not a recursive watch of the whole root. The set of watched directories is therefore bounded
  by what someone actually expanded, which is what keeps this off the `node_modules` cliff.
- **A new `directory_changed` wire message**, broadcast when a watched directory's contents
  change on disk, whatever caused it.
- **Client handling** of that message: re-list the directory if the tree is showing it, re-read
  the open preview if it lives there, and refresh git status.
- **A manual refresh control** on the file tree — the safety net for the cases a watcher cannot
  cover (a filesystem that emits no events: network mounts, some containers, an exhausted
  inotify budget).
- **A `files.watch` setting** to turn watching off for deployments where it is a liability.

## Capabilities

### New Capabilities
- `file`: watching listed directories and announcing what changed on disk.
- `config`: `files.watch`.

### Modified Capabilities
- `components`: the file tree reflects on-disk changes without interaction, and offers a manual
  refresh.

## Impact

- `new`: `server/src/fileWatcher.ts`, `server/test/fileWatcher.test.ts`.
- `file`: `shared/src/protocol.ts` — one added `ServerMessage` variant.
- `file`: `server/src/config.ts` — `FilesConfig`, defaults, validation.
- `file`: `server/src/index.ts` — build the watcher, register in `handleListDirectory`, broadcast.
- `file`: `server/src/fileBrowser.ts` — export `resolveConfined` so the watcher shares the one
  confinement rule rather than growing a second.
- `file`: `ui/src/useAgent.ts` — handle `directory_changed`, expose `refreshFileTree`.
- `file`: `ui/src/components/FileTree.tsx`, `ui/src/components/Sidebar.tsx`, `ui/src/App.tsx` —
  the refresh control.
- `file`: `README.md`, `pi-outpost.config.example.json` — document `files.watch`.

**No new dependency.** `fs.watch` is used directly; see design D2.
