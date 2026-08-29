Every `#### Scenario:` in this change's delta, and what proves it. Built for task 4.1.
Read the assertions, not the names: a scenario counts as **covered** only when the
check would fail if the behaviour broke at the boundary the scenario describes.

Files referenced:

- `server/test/releaseChannel.test.mjs` (`ch`) — the rule itself, asked directly
- `server/test/release-workflow.test.mjs` (`wf`) — that the pipeline uses that rule,
  for both answers
- `server/test/update.test.ts` (`upd`) — what the update check reads, unchanged here

## update (5)

| Scenario | Status | Evidence |
| --- | --- | --- |
| APrereleaseDoesNotMoveTheDefaultChannel | covered | ch "a prerelease never takes it" requires `channelFor` to return something other than `latest` for every prerelease shape, and wf requires the publish step to pass that channel as `--tag`. The other half is pre-existing and untouched: `fetchLatestVersion` asks `${registry}/pi-outpost/latest`, so a version that never reaches that tag is never offered |
| AReleaseStillMovesIt | covered | ch "a release takes the default channel" over four release versions; wf proves the same derived value is what `--tag` receives, so a release publishes to `latest` exactly as before |
| TheChannelComesFromTheVersion | covered | ch is the whole file — the answer is a function of the version and nothing else. wf "one derivation feeds both the npm channel and the release listing" requires the workflow to call that module in both jobs, and requires the publish step *not* to match the old tagless form |
| APrereleaseIsListedAsOne | covered | wf requires `--prerelease` to be set from the same `$channel` and passed to `gh release create`, and requires the attach job to check out the module it runs — it previously had no working copy, so the rule would have been unreachable there |
| AskingForItInstallsIt | covered | ch "a prerelease publishes under its own identifier" pins that `0.17.0-beta.1` → `beta`, which is the name `npm install pi-outpost@beta` resolves. Nothing in this repository implements that resolution: it is npm's, and what this change owes it is a channel with the name an operator would ask for |

## Result

All **5 scenarios are covered**. There are no partial or uncovered rows.

## Two defects review caught, both on the guarantee itself

- **A prerelease may name the default channel.** `1.2.3-latest.1` is a valid version
  whose identifier *is* `latest`, and the rule returned it: the workflow would then
  move npm's default tag and create an ordinary release. Not through a mistake — through
  the front door, since the identifier is what becomes the channel. It is now refused,
  loudly, which stops the job rather than the installations.
- **A rerun could not correct a release already marked wrongly.** The attach job exists
  partly to repair a release, and a repair skips the create — so a flag passed only at
  creation would never reach it. The derived state is now stated on every run, in both
  directions.

## What is asserted here and what is not

The rule is a module so that it can be asked rather than pattern-matched. Given
`0.17.0-beta.1` it answers `beta`; given `v0.17.0` it throws rather than guessing,
because guessing means treating it as a release and taking `latest` with it — the one
mistake on this path that reaches every installation.

What remains matched against the YAML is that the workflow *calls* it, in both places,
and passes both flags. That is the same form the file's existing test already uses, and
the part that only a real tag can exercise. The first prerelease is therefore also the
proof: if `latest` moves, it moves visibly, and `npm dist-tag ls pi-outpost` says so
before anyone's update check does.
