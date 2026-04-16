import { CanisterConfig, Config } from "../types.js";
import { cliError } from "../error.js";

export function resolveCanisterConfigs(
  config: Config,
): Record<string, CanisterConfig> {
  if (!config.canisters) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(config.canisters).map(([name, c]) =>
      typeof c === "string" ? [name, { main: c }] : [name, c],
    ),
  );
}

export function filterCanisters(
  canisters: Record<string, CanisterConfig>,
  names?: string[],
): Record<string, CanisterConfig> {
  if (!names) {
    return canisters;
  }
  const invalidNames = names.filter((name) => !(name in canisters));
  if (invalidNames.length) {
    cliError(
      `Canister(s) not found in mops.toml: ${invalidNames.join(", ")}. Available: ${Object.keys(canisters).join(", ")}`,
    );
  }
  return Object.fromEntries(
    Object.entries(canisters).filter(([name]) => names.includes(name)),
  );
}

export function resolveSingleCanister(
  config: Config,
  canisterName?: string,
): { name: string; canister: CanisterConfig } {
  const canisters = resolveCanisterConfigs(config);
  const names = Object.keys(canisters);

  if (names.length === 0) {
    cliError("No canisters defined in mops.toml [canisters] section");
  }

  if (canisterName) {
    const canister = canisters[canisterName];
    if (!canister) {
      cliError(
        `Canister '${canisterName}' not found in mops.toml. Available: ${names.join(", ")}`,
      );
    }
    return { name: canisterName, canister };
  }

  if (names.length > 1) {
    cliError(
      `Multiple canisters defined in mops.toml. Please specify one: ${names.join(", ")}`,
    );
  }

  return { name: names[0]!, canister: canisters[names[0]!]! };
}

export function looksLikeFile(arg: string): boolean {
  return (
    arg.endsWith(".mo") ||
    arg.endsWith(".most") ||
    arg.includes("/") ||
    arg.includes("\\")
  );
}

export function validateCanisterArgs(
  canister: CanisterConfig,
  canisterName: string,
  config?: Config,
): void {
  if (canister.args && typeof canister.args === "string") {
    cliError(
      `Canister config 'args' should be an array of strings for canister ${canisterName}`,
    );
  }
  if (!canister.migrations) {
    return;
  }
  const flagSources: [string, string[] | undefined][] = [
    [`[canisters.${canisterName}].args`, canister.args],
    ["[moc].args", config?.moc?.args],
    ["[build].args", config?.build?.args],
  ];
  for (const [section, args] of flagSources) {
    if (args?.some((a) => a.startsWith("--enhanced-migration"))) {
      cliError(
        `Canister '${canisterName}' has [migrations] config but --enhanced-migration in ${section}.\n` +
          "Remove --enhanced-migration — it is managed automatically when [migrations] is configured.",
      );
    }
  }
}
