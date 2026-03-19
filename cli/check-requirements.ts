import path from "node:path";
import { SemVer } from "semver";
import chalk from "chalk";

import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { resolvePackages } from "./resolve-packages.js";
import { getMocSemVer } from "./helpers/get-moc-version.js";
import { getPackageId } from "./helpers/get-package-id.js";

export async function checkRequirements({ verbose = false } = {}) {
  let installedMoc = getMocSemVer();
  if (!installedMoc) {
    return;
  }
  let highestRequiredMoc = new SemVer("0.0.0");
  let highestRequiredMocPkgId = "";
  let rootDir = getRootDir();

  let resolvedPackages = await resolvePackages();
  for (let [name, version] of Object.entries(resolvedPackages)) {
    if (getDependencyType(version) === "mops") {
      let pkgId = getPackageId(name, version);
      let depConfig = readConfig(
        path.join(rootDir, ".mops", pkgId, "mops.toml"),
      );
      let moc = depConfig.requirements?.moc;

      if (moc) {
        let requiredMoc = new SemVer(moc);
        if (highestRequiredMoc.compare(requiredMoc) < 0) {
          highestRequiredMoc = requiredMoc;
          highestRequiredMocPkgId = pkgId;
        }
        verbose && _check(pkgId, installedMoc, requiredMoc);
      }
    }
  }

  verbose || _check(highestRequiredMocPkgId, installedMoc, highestRequiredMoc);
}

function _check(pkgId: string, installedMoc: SemVer, requiredMoc: SemVer) {
  let comp = installedMoc.compare(requiredMoc);
  if (comp < 0) {
    console.log(
      chalk.yellow(`moc version does not meet the requirements of ${pkgId}`),
    );
    console.log(chalk.yellow(`  Required: >= ${requiredMoc.format()}`));
    console.log(chalk.yellow(`  Installed:   ${installedMoc.format()}`));
  }
}
