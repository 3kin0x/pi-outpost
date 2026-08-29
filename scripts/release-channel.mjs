/**
 * Which channel a version belongs to.
 *
 * The release workflow publishes with `npm publish --tag <channel>` and creates the
 * GitHub Release with or without `--prerelease`. Both answers come from here, from the
 * version alone, so they cannot disagree: a version published to a prerelease channel
 * and displayed as the current release is the failure this exists to prevent.
 *
 * Derived rather than configured. A workflow input would let a release go to `beta`,
 * or a beta to `latest`, on the day someone leaves the box at its default — and moving
 * `latest` to a prerelease is what makes every existing installation offer it, since
 * the update check reads that tag and not the highest version number.
 *
 *   node scripts/release-channel.mjs 0.17.0-beta.1   # → beta
 *   node scripts/release-channel.mjs 0.17.0          # → latest
 */

/** semver, reduced to the two things this has to tell apart. */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** The channel a release goes to, and the only one an update check reads. */
export const DEFAULT_CHANNEL = "latest";
/** A prerelease whose identifier is only a number has no name to use; it takes this. */
export const UNNAMED_PRERELEASE_CHANNEL = "next";

export class VersionError extends Error {}

/**
 * The npm dist-tag for a version.
 *
 * A prerelease publishes under its own identifier — `beta`, `rc`, `alpha` — rather
 * than a single hardcoded name: putting a release candidate on the beta channel is a
 * lie told to whoever asked for one or the other.
 *
 * Refuses what it cannot read, and what it must not answer. A version this does not
 * recognise would otherwise be treated as a release and take `latest` with it, which
 * is the one mistake that reaches every installation — and a prerelease that *names*
 * itself `latest` would reach it through the front door, since the identifier is what
 * becomes the channel.
 */
export function channelFor(version) {
  const match = VERSION.exec(String(version).trim());
  if (!match) throw new VersionError(`not a version this can classify: "${version}"`);
  const prerelease = match[4];
  if (prerelease === undefined) return DEFAULT_CHANNEL;
  const identifier = prerelease.split(".")[0];
  if (identifier.toLowerCase() === DEFAULT_CHANNEL) {
    throw new VersionError(
      `"${version}" is a prerelease naming the default channel: publishing it would move "${DEFAULT_CHANNEL}" onto a prerelease`,
    );
  }
  return /^\d+$/.test(identifier) ? UNNAMED_PRERELEASE_CHANNEL : identifier;
}

/** Whether this version is a prerelease, by the same reading. */
export function isPrerelease(version) {
  return channelFor(version) !== DEFAULT_CHANNEL;
}

// Called by the workflow: prints the channel, or fails loudly enough to stop the job.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const version = process.argv[2];
  try {
    process.stdout.write(channelFor(version));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
