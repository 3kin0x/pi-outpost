## Context

See proposal.md — Why.

What the code does today, exactly:

- `server/src/git.ts` spawns `execFileAsync("git", args, { cwd })`. Bare name, no shell: resolution is entirely the process `PATH`'s business, and there is no configuration for it. `rg gitPath server/src/config.ts` returns nothing.
- `probeGit` wraps that call in `try { … } catch { return null }`. Every failure — ENOENT, "not a git repository", "detected dubious ownership", a timeout — collapses to the same `null`.
- `index.ts` turns an empty repository set into `gitAvailable: false`, and the UI hides every git affordance behind that one boolean.

So the diagnosis a user can perform is: none. The report that prompted this change was "I no longer see git on my project"; the server had nothing to say, and restarting it looked like a reasonable next move.

## Goals / Non-Goals

**Goals:**

- Find git where installers put it, so a `PATH` that lost an entry does not remove a feature.
- Make "unavailable" a statement with a reason attached, in the snapshot the client already receives.
- Keep the three reasons distinguishable, and treat only the fixable ones as faults.
- Preserve the property that git is spawned without a shell, from a path the operator or the platform chose — never one the workspace can influence.

**Non-Goals:**

- Changing which git commands run, their arguments, their confinement, or the repository-set behaviour built on them.
- Bundling or installing git.
- A settings control that edits the git path: the executable is the deployment's, like `sandbox` and `extensionPaths`, and is shown rather than edited.
- Diagnosing a repository beyond what git itself says about it.

## Decisions

### Resolve once per run, at startup, and fail startup on a bad configured path

Resolution is a small ordered search that ends at the first candidate answering `git --version`. It runs once and the answer is held for the process, because it cannot change usefully mid-run and because doing it per command would add a spawn to every badge refresh.

Startup is the right moment for the configured-path error: the config spec already fails startup on an invalid setting (`UpdateRegistrySetting` sets the precedent), and an operator who mistyped a path should learn at boot, not the first time someone opens a file tree.

*Alternative — resolve lazily on first git use.* Defers the error to a moment with no good place to report it, and makes an invalid configuration look like a workspace problem.

### The candidate order, and what is deliberately not in it

1. The configured path, when set. If it does not answer, resolution **fails** — it does not fall through. Naming an executable is an instruction, and quietly running a different git would answer questions about the wrong installation.
2. `git` as `PATH` resolves it.
3. The platform's standard locations:
   - Windows: `%ProgramFiles%\Git\cmd\git.exe`, `%ProgramW6432%\Git\cmd\git.exe`, `%ProgramFiles(x86)%\Git\cmd\git.exe`, `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`
   - macOS: `/usr/bin/git`, `/opt/homebrew/bin/git`, `/usr/local/bin/git`, `/Library/Developer/CommandLineTools/usr/bin/git`
   - Linux: `/usr/bin/git`, `/usr/local/bin/git`

**SECURITY**: no candidate is ever relative, and none is derived from the workspace, the browser root or the current working directory. A repository that could contribute a candidate would be a repository that can choose which binary the server runs on its behalf. The list is absolute paths and environment variables the operator controls.

*Alternative — shell out to `where`/`which`.* Spawns a shell, which is the one thing this module has never done, and answers the same question `PATH` resolution already answers.

### The reason is classified from git's own failure, and defaults to the loud one

- The executable could not be resolved → **no executable**.
- The probe ran and said "not a repository", and discovery found none underneath → **no repository**.
- The probe failed any other way → **refused**, carrying git's first stderr line verbatim. "detected dubious ownership in repository at …" names both the directory and the remedy; paraphrasing it would lose both.

An unrecognised failure classifies as *refused* rather than *no repository*, so a new failure mode surfaces instead of disappearing into the ordinary case. That is the direction the current code got wrong.

### On the wire: a reason beside the boolean, not instead of it

`gitAvailable` stays. The snapshot gains an optional companion carrying the reason and, where there is one, git's message. Clients that only gate on the boolean keep working; the one that wants to explain has something to read.

*Alternative — replace the boolean with a status enum.* Every existing check becomes a comparison, for no gain: "is git usable" is a real question with a boolean answer, asked in a dozen places.

### Shown in Settings, and only when it is a fault

The settings panel already reports what the deployment gave the server — sandbox, extension paths, tools — and is where a user goes when something is missing. The reason is shown there.

A workspace holding no repository is the ordinary state of a directory, and is stated plainly with nothing to fix. A missing executable or a refused repository is a setup fault: it names the path tried, or repeats git's message, so the user can act without reading a log they do not have.

*Alternative — a banner or toast.* Loud on every connect for a condition that is often permanent and often correct (a directory with no repository).

## Risks / Trade-offs

- **A standard-location search finds a git the operator did not intend** — an old bundled copy, say. → The configured path takes precedence and is the documented answer; the resolved path is shown in Settings, so what is running is visible rather than guessed.
- **Classifying on git's stderr is string matching, and stderr is localised.** → Only the "not a repository" case is matched, and an unmatched failure classifies as the loud reason rather than the quiet one, so a mismatch over-reports instead of hiding. Never inspected for anything but this classification.
- **A startup failure on a mistyped path is a hard stop.** → Consistent with the rest of the configuration, and the alternative is a server that runs with a feature silently missing, which is the bug being fixed.
- **`git --version` at startup costs a spawn per candidate until one answers.** → Bounded by a short list, ends at the first hit, and happens once.
- **The reason is computed per workspace, and a workspace can gain a repository later.** → It is derived from the repository set, so the existing re-scan clears it; a scenario pins that.

## Migration Plan

No data migration. A deployment with git on `PATH` is unaffected: `PATH` is tried before any standard location, and no setting is required. Rollback is a revert.

## Open Questions

- Whether the resolved executable path is worth showing in Settings when git *is* available, or only when it is not. A presentation detail, settled once it is seen running.
