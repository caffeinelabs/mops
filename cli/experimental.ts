import { Config } from "./types.js";

// Opted into via [experimental] flags = [...] in mops.toml. Unstable behavior.
export function isExperimentEnabled(config: Config, flag: string): boolean {
  return config.experimental?.flags?.includes(flag) ?? false;
}
