## Context

See `proposal.md` for motivation and `specs/update/spec.md` for the contract.

Two lines produce the current behaviour, both in `.github/workflows/release.yml`:

```yaml
npm publish --workspace "$pkg"        # no --tag, so npm moves `latest`
gh release create "$GITHUB_REF_NAME"  # no --prerelease, so GitHub calls it the newest
```

The client side already does the right thing: `fetchLatestVersion` asks
`${registry}/pi-outpost/latest`, so it reads the default dist-tag rather than the
highest version number. Nothing there changes.

## Goals / Non-Goals

**Goals:**

- A prerelease reachable by name and invisible to an update check.
- The choice made by the version string, not by a hand-set input.

**Non-Goals:**

- A prerelease channel in the update command — asking for one is `npm install
  pi-outpost@beta`, which needs nothing from us.
- Changing what a release does.
- Deciding a release cadence, or what belongs in a prerelease.

## Decisions

### The dist-tag is derived from the version, and derived in a module

A workflow input would let a release be published to `beta`, or a beta to `latest`, on
the day someone leaves the box at its default. The version already says which it is —
semver reserves the hyphen for exactly this — so the version is the input.

It lives in a small module rather than an expression inside the YAML, because a rule
embedded in a workflow can only be tested by matching strings against the workflow
file, and that tests the text rather than the decision. A module can be given
`0.17.0-beta.1` and asked what it answers.

### The channel is the prerelease's own identifier

`0.17.0-beta.1` publishes to `beta`, `0.18.0-rc.1` to `rc`. Hardcoding `beta` would
put a release candidate on the beta channel, which is a lie told to whoever asked for
one or the other.

A prerelease with no identifier — `0.17.0-1`, which semver allows — has no name to
use, and takes `next`: a channel that is not `latest`, which is the property that
matters.

### GitHub's flag comes from the same answer

`--prerelease` is set from the same derivation, so the npm channel and the GitHub
listing cannot disagree. Two independent decisions about the same version is how a
release ends up published as a beta and displayed as the current one.

## Risks / Trade-offs

- [A version published to a channel nobody knows about is invisible] → It is announced
  as a prerelease on the release page, which is where the executables already are.
- [`latest` is never moved back by a prerelease, so a beta published after a release
  stays behind it for anyone not asking] → That is the requirement, not a side effect.
- [A workflow change is only exercised by tagging] → The decision is unit-tested, and
  what remains untested is the two flags being passed, which the existing
  workflow-shape test covers the way it covers the rest of that file.
