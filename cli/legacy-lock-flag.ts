import { Option } from "commander";

// Temporary v2 compatibility shim, remove once callers are migrated.
//
// v3 replaced `--lock <check|update|ignore>` with the boolean `--locked`, so
// every v2 call site baked into a pipeline, Dockerfile or agent prompt fails to
// parse. Declare the flag on the commands that used to take it and drop the
// value on the floor — including `check`, which is not mapped to `--locked`.
//
// It has to be a declared option rather than `.allowUnknownOption()`: the flag
// takes a value, and an unknown option would leave that value bound to a
// positional argument (`mops add --lock update pkg` -> pkg === "--lock").
export function legacyLockOption(): Option {
  return new Option("--lock <mode>").hideHelp().argParser(() => undefined);
}
