import process from "node:process";
import chalk from "chalk";
import semver from "semver";

// The server version used when `[toolchain] pocket-ic` is unset. A fixed
// constant, never a "latest" lookup: a cache warmed at image build time has to
// mean runtime never reaches the network.
//
// Bump policy: this is the version the bundled `@dfinity/pic` pins for itself.
// When that client is upgraded, re-run the replica tests and move this with it.
// It is a default, not a ceiling — an explicit pin can be anything.
export const DEFAULT_POCKET_IC_VERSION = "14.0.0";

// The oldest server the bundled client can speak to. This is a migration guard,
// not a version policy: `< 9.0.0` pins really did work in 2.x through the
// legacy `pic-ic` client, which v3 removes. Without it those projects would get
// an inscrutable `BinTimeoutError` from the client instead of being told what
// happened. Newer servers are not checked at all — mops does not keep a list of
// blessed versions for any other tool either.
export const MIN_POCKET_IC_VERSION = "9.0.0";

export function assertMinimumVersion(version: string): void {
  // A pin can be a path to a binary, which mops neither downloads nor checks.
  if (!semver.valid(version) || semver.gte(version, MIN_POCKET_IC_VERSION)) {
    return;
  }
  console.error(
    chalk.red("Error: ") +
      `pocket-ic ${version} is no longer supported. mops 3.0.0 removed the legacy ` +
      `PocketIC client, so pins below ${MIN_POCKET_IC_VERSION} no longer work.`,
  );
  console.log(
    `Run ${chalk.green(`mops toolchain use pocket-ic ${DEFAULT_POCKET_IC_VERSION}`)} to move to a supported version.`,
  );
  process.exit(1);
}
