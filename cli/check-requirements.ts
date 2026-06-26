import path from "node:path";
import { SemVer } from "semver";
import chalk from "chalk";

import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { resolvePackages } from "./resolve-packages.js";
import { getMocSemVer } from "./helpers/get-moc-version.js";
import { getLintokoSemVer } from "./helpers/get-lintoko-version.js";
import { getPackageId } from "./helpers/get-package-id.js";
import type { Requirements } from "./types.js";

type ToolRequirement = keyof Requirements;

const TOOL_REQUIREMENTS: {
  tool: ToolRequirement;
  getInstalled: () => SemVer | null;
}[] = [
  { tool: "moc", getInstalled: getMocSemVer },
  { tool: "lintoko", getInstalled: getLintokoSemVer },
];

export async function checkRequirements({ verbose = false } = {}) {
  let rootDir = getRootDir();
  let resolvedPackages = await resolvePackages();

  for (let { tool, getInstalled } of TOOL_REQUIREMENTS) {
    let installed = getInstalled();
    if (!installed) {
      continue;
    }

    let highestRequired = new SemVer("0.0.0");
    let highestRequiredPkgId = "";

    for (let [name, version] of Object.entries(resolvedPackages)) {
      if (getDependencyType(version) === "mops") {
        let pkgId = getPackageId(name, version);
        let depConfig = readConfig(
          path.join(rootDir, ".mops", pkgId, "mops.toml"),
        );
        let required = depConfig.requirements?.[tool];

        if (required) {
          let requiredVersion = new SemVer(required);
          if (highestRequired.compare(requiredVersion) < 0) {
            highestRequired = requiredVersion;
            highestRequiredPkgId = pkgId;
          }
          verbose && _check(tool, pkgId, installed, requiredVersion);
        }
      }
    }

    verbose || _check(tool, highestRequiredPkgId, installed, highestRequired);
  }
}

function _check(
  tool: ToolRequirement,
  pkgId: string,
  installed: SemVer,
  required: SemVer,
) {
  if (!pkgId || installed.compare(required) >= 0) {
    return;
  }

  console.log(
    chalk.yellow(`${tool} version does not meet the requirements of ${pkgId}`),
  );
  console.log(chalk.yellow(`  Required: >= ${required.format()}`));
  console.log(chalk.yellow(`  Installed:   ${installed.format()}`));
}
