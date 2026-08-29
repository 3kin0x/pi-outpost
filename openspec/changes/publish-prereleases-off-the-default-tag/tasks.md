## 1. The rule

- [x] 1.1 Add a module that answers, for a version, whether it is a prerelease and which npm dist-tag it belongs to; verify unit tests cover a release, a beta, a release candidate, a prerelease with no identifier, and a version the module should refuse rather than guess at.

## 2. The pipeline

- [x] 2.1 Publish each package with the dist-tag that module returns; verify the workflow-shape test asserts the publish step passes a derived tag rather than none.
- [x] 2.2 Create the GitHub release with `--prerelease` from the same answer; verify the workflow-shape test asserts both flags come from one derivation, so the npm channel and the release listing cannot disagree.

## 3. The version being released

- [x] 3.1 Set `cli` and `embed` to `0.17.0-beta.1`, the two packages the release job publishes; verify the packages agree with the tag that will be pushed, which is what the pipeline already refuses to publish without.

## 4. Scenario coverage and validation

- [x] 4.1 Enumerate every `#### Scenario:` in the delta and write the scenario-to-test matrix with assertion-level evidence, naming what would fail if each broke; leave no scenario partial or uncovered — `scenario-coverage.md`, 5/5 covered, and explicit about what only a real tag can exercise
- [x] 4.2 Run the focused tests, then the relevant full suites and `openspec validate publish-prereleases-off-the-default-tag --strict` — typecheck passed; lint passed; `check:cli` passed against the bumped package; server 1,598 passed with nothing skipped; UI 1,346 passed; strict validation passed
