import chalk from "chalk";

let alreadyWarned = false;

// Prints a deprecation warning (once per process) when a `[toolchain] pocket-ic`
// pin below 9.0.0 selects the legacy `pic-ic` client. Removal is tracked in
// NEXT-MAJOR.md under "Drop the legacy PocketIC client".
export function warnLegacyPocketIc(version: string): void {
  if (alreadyWarned) {
    return;
  }
  alreadyWarned = true;
  console.log(
    chalk.yellow(
      `\`pocket-ic\` is pinned to ${version} in \`[toolchain]\`. Support for \`pocket-ic\` below 9.0.0 is deprecated and will be removed in mops v3.\n` +
        "Run `mops toolchain use pocket-ic 12.0.0` to move to a supported version and silence this warning.",
    ),
  );
}
