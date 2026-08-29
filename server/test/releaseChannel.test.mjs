/**
 * Which channel a version publishes to.
 *
 * The whole point of this rule living in a module is that it can be asked. Inside the
 * workflow it could only be checked by matching strings against a YAML file, which
 * tests the text and not the decision — and the decision is the one that, made wrong,
 * moves `latest` onto a prerelease and offers it to every existing installation.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_CHANNEL,
  UNNAMED_PRERELEASE_CHANNEL,
  VersionError,
  channelFor,
  isPrerelease,
} from "../../scripts/release-channel.mjs";

// openlore: scenario=TheChannelComesFromTheVersion spec=update
describe("the channel comes from the version", () => {
  test("a release takes the default channel", () => {
    for (const version of ["0.17.0", "1.0.0", "0.16.4", "10.20.30"]) {
      assert.equal(channelFor(version), DEFAULT_CHANNEL, version);
      assert.equal(isPrerelease(version), false, version);
    }
  });

  // openlore: scenario=APrereleaseDoesNotMoveTheDefaultChannel spec=update
  test("a prerelease never takes it", () => {
    for (const version of ["0.17.0-beta.1", "0.18.0-rc.2", "1.0.0-alpha", "0.17.0-1"]) {
      assert.notEqual(channelFor(version), DEFAULT_CHANNEL, version);
      assert.equal(isPrerelease(version), true, version);
    }
  });

  test("a prerelease publishes under its own identifier, not one name for all of them", () => {
    // A release candidate on the beta channel is a lie told to whoever asked for one
    // or the other.
    assert.equal(channelFor("0.17.0-beta.1"), "beta");
    assert.equal(channelFor("0.18.0-rc.2"), "rc");
    assert.equal(channelFor("1.0.0-alpha.3"), "alpha");
    assert.equal(channelFor("1.0.0-alpha"), "alpha");
  });

  test("a prerelease with only a number has no name to use, and takes one that is not the default", () => {
    assert.equal(channelFor("0.17.0-1"), UNNAMED_PRERELEASE_CHANNEL);
    assert.notEqual(UNNAMED_PRERELEASE_CHANNEL, DEFAULT_CHANNEL);
  });

  test("build metadata is not a prerelease", () => {
    // `+sha` says how it was built, never that it is unfinished.
    assert.equal(channelFor("0.17.0+abc123"), DEFAULT_CHANNEL);
    assert.equal(channelFor("0.17.0-beta.1+abc123"), "beta");
  });

  test("what it cannot read, it refuses rather than guesses", () => {
    // Guessing means treating it as a release, which takes `latest` with it — the one
    // mistake here that reaches every installation.
    for (const bad of ["v0.17.0", "0.17", "", "latest", "0.17.0.1", "beta"]) {
      assert.throws(() => channelFor(bad), VersionError, `"${bad}" should be refused`);
    }
  });

  test("a prerelease may not name the default channel", () => {
    // `1.2.3-latest.1` is a valid version whose identifier is the one name that must
    // never be answered: it would move the tag every update check reads, through the
    // front door rather than by a mistake.
    for (const named of ["1.2.3-latest.1", "1.2.3-latest", "1.2.3-LATEST.2"]) {
      assert.throws(() => channelFor(named), VersionError, named);
    }
  });

  test("the version the release is being cut at goes where it should", () => {
    assert.equal(channelFor("0.17.0-beta.1"), "beta");
  });
});
