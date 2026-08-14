// Split out of `pocket-ic.ts` so the tests can assert against the constants:
// that module reaches `mops.js` for the cache dir, and jest's ESM resolver
// cannot follow its `.js` specifiers.
import chalk from "chalk";
import semver from "semver";
import { cliError } from "../../error.js";

// Hint-only — never a runtime fallback. Bump when recommending a new server.
// TODO: @dfinity/pic 0.23.0 (latest) still postinstalls pocket-ic 14.0.0; bump
// the client when a release tracks 15.x. Mops does not use pic's bundled binary.
export const RECOMMENDED_POCKET_IC_VERSION = "15.0.0";

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
  cliError(
    `Error: pocket-ic ${version} is no longer supported. mops 3.0.0 removed the legacy ` +
      `PocketIC client, so pins below ${MIN_POCKET_IC_VERSION} no longer work.\n` +
      `Run ${chalk.green(`mops toolchain use pocket-ic ${RECOMMENDED_POCKET_IC_VERSION}`)} to move to a supported version.`,
  );
}
