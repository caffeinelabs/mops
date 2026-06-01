import chalk from "chalk";

export type ReplicaName = "dfx" | "pocket-ic" | "dfx-pocket-ic";

let alreadyWarned = false;

// Prints a deprecation warning (once per process) when `mops bench`/`mops test`/
// `mops watch` is about to use a dfx-backed replica. Removal is tracked in
// NEXT-MAJOR.md under "Drop dfx coupling".
export function warnIfDfxReplica(
  replicaType: ReplicaName,
  explicit: boolean,
): void {
  if (alreadyWarned) {
    return;
  }
  if (replicaType !== "dfx" && replicaType !== "dfx-pocket-ic") {
    return;
  }
  alreadyWarned = true;
  let lead =
    explicit && replicaType === "dfx"
      ? "`--replica dfx` is deprecated and will be removed in a future release."
      : replicaType === "dfx-pocket-ic"
        ? "Falling back to dfx-bundled PocketIC because no `pocket-ic` version is set in `[toolchain]`. This fallback is deprecated and will be removed in a future release."
        : "Using `dfx` replica because no `pocket-ic` version is set in `[toolchain]`. The `dfx` replica is deprecated and will be removed in a future release.";
  console.log(
    chalk.yellow(
      `${lead}\nRun \`mops toolchain use pocket-ic 12.0.0\` to pin a PocketIC version and silence this warning.`,
    ),
  );
}
