import type { Config } from "../types.js";

const OPT_LEVELS = new Set(["O0", "O1", "O2", "O3", "O4", "Os", "Oz"]);

export type OptimizeResolved = {
  level: string;
  keepNames: boolean;
  args: string[];
};

/** `[optimize]` present (including empty table) enables the post-pass. */
export function isOptimizeEnabled(config: Config): boolean {
  return config.optimize !== undefined;
}

export function resolveOptimizeConfig(config: Config): OptimizeResolved | null {
  if (!isOptimizeEnabled(config)) {
    return null;
  }
  let level = config.optimize?.level ?? "O3";
  if (!OPT_LEVELS.has(level)) {
    throw new Error(
      `Invalid [optimize].level "${level}". Expected one of: ${[...OPT_LEVELS].join(", ")}`,
    );
  }
  let keepNames = config.optimize?.["keep-names"] ?? true;
  let args = config.optimize?.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
    throw new Error(`[optimize].args must be an array of strings`);
  }
  return { level, keepNames, args };
}

/** Describe the active optimize settings for bench/build verbose output. */
export function formatOptimizePipeline(config: Config): string {
  let resolved = resolveOptimizeConfig(config);
  if (!resolved) {
    return "none (raw moc output)";
  }
  let version = config.toolchain?.["wasm-opt"] ?? "auto";
  let flags = [`-${resolved.level}`];
  if (resolved.keepNames) {
    flags.push("-g");
  }
  flags.push(...resolved.args);
  return `wasm-opt ${version} ${flags.join(" ")}`;
}
