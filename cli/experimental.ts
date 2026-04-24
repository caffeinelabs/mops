import { Config } from "./types.js";

// Experimental flags are opted into via [experimental] flags = [...] in mops.toml.
// Behavior behind a flag may change or be removed without notice.
// Concrete flags are introduced alongside the feature that uses them.
export function isExperimentEnabled(config: Config, flag: string): boolean {
  return config.experimental?.flags?.includes(flag) ?? false;
}
