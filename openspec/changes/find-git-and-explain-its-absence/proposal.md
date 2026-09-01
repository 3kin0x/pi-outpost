## Why

A user opened a project on Windows and the entire git surface was gone — no branch chip, no tree badges, no diff, no history. He restarted the server; nothing changed. VS Code, on the same project, showed git perfectly. Git was installed all along, at `C:\Program Files\Git\cmd\git.exe`; it simply was not on the `PATH` the server process inherited, and the server spawns `git` by bare name with no shell.

Two failures compound there. The system cannot find a binary that is sitting in the place every Windows installer puts it — VS Code looks, we do not. And when the probe fails, `probeGit` catches every error and returns `null`, so "git is not installed", "this directory is not a repository" and "git refused this repository" are one indistinguishable silence. The user is shown a product with a feature missing and no way to learn why, which is why a restart looked like a reasonable thing to try.

## What Changes

- Resolve the git executable rather than trusting `PATH`: an explicitly configured path first, then `PATH`, then the standard install locations for the platform.
- Add an optional configuration setting naming the git executable, for a deployment where it lives somewhere unusual.
- Distinguish why git is unavailable — the binary could not be run, the directory holds no repository, or git ran and refused — and carry that reason, with git's own message where there is one, in the session snapshot.
- Surface the reason in the interface where a user goes when something is missing, loudly enough to act on when it is a setup problem and quietly when it is simply a directory with no repository in it.
- **BREAKING** `gitAvailable` alone no longer describes git's state on the wire; it is accompanied by the reason when false.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `git`: Locate the git executable instead of relying on `PATH`; report why git is unavailable rather than reporting only that it is.
- `config`: Add an optional setting naming the git executable.

## Impact

- `server/src/git.ts`: executable resolution, and a probe that returns a reason rather than `null`.
- `server/src/config.ts`: the new setting, its validation and its error.
- `server/src/index.ts`: the snapshot carries the reason.
- Shared protocol: the session snapshot's git fields.
- `ui/src`: where the reason is shown, and how loudly.
- User and developer documentation for the new setting and the diagnosis it enables.
- No change to which git commands run, to their confinement, or to the repository-set behaviour built on top of them.
