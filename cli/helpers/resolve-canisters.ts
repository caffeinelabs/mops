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

export function resolveCanisterEntrypoints(config: Config): string[] {
  const canisters = resolveCanisterConfigs(config);
  return Object.values(canisters)
    .map((c) => c.main)
    .filter((main): main is string => Boolean(main));
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
