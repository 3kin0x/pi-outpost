## Why

The release pipeline can only publish one way: `npm publish` with no tag, which moves
`latest`, and `gh release create` with no flag, which marks the release as the newest.
There is no way to put a version in front of a few people without putting it in front
of everyone.

That matters because the update check asks the registry for the `latest` dist-tag. A
prerelease published the way this pipeline publishes would become what every existing
installation is told to upgrade to.

## What Changes

- Publish a prerelease under its own npm dist-tag, derived from the version itself
  rather than chosen at release time — `0.17.0-beta.1` goes to `beta`, and a release
  version still goes to `latest`.
- Mark a prerelease as such on GitHub, so the release page does not present it as the
  current one.
- Change nothing about a release version: same tag, same page, same executables.

## Capabilities

### Modified Capabilities

- `update`: the update check reads the registry's default tag, and nothing says what a
  prerelease does to it. It gains the guarantee it depends on — a prerelease is not
  what an installation is offered.

## Impact

- The release workflow's publish and release-creation steps.
- A small module deciding the dist-tag from a version, so the rule is a tested function
  rather than an expression inside a YAML file nobody can run.
- No change to the client: the update check already asks for `latest`, which is exactly
  the behaviour this preserves.
