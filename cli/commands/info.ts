import process from "node:process";
import chalk from "chalk";
import { mainActor } from "../api/actors.js";
import { resolveVersion } from "../api/resolveVersion.js";
import type { PackageDetails } from "../declarations/main/main.did.js";

function label(text: string): string {
  return chalk.bold(text.padEnd(16));
}

export interface InfoOptions {
  versions?: boolean;
}

export async function info(pkgArg: string, options: InfoOptions = {}) {
  let [name, versionArg] = pkgArg.split("@") as [string, string | undefined];
  let actor = await mainActor();

  let version: string;
  try {
    version = await resolveVersion(name, versionArg ?? "");
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red("Error: ") + message);
    process.exit(1);
  }

  let res = await actor.getPackageDetails(name, version);
  if ("err" in res) {
    console.error(chalk.red("Error: ") + res.err);
    process.exit(1);
  }

  let d: PackageDetails = res.ok;
  let c = d.config;

  // d.versions is in ascending order (oldest first)
  if (options.versions) {
    for (let ver of d.versions) {
      console.log(ver);
    }
    return;
  }

  console.log("");
  console.log(
    `${chalk.green.bold(c.name)}${chalk.gray("@")}${chalk.yellow(c.version)}`,
  );

  if (c.description) {
    console.log(chalk.dim(c.description));
  }

  if (c.version !== d.highestVersion) {
    console.log(chalk.yellow(`latest: ${d.highestVersion}`));
  }

  console.log("");

  if (c.license) {
    console.log(`${label("license")}${c.license}`);
  }
  if (c.repository) {
    console.log(`${label("repository")}${chalk.cyan(c.repository)}`);
  }
  if (c.homepage) {
    console.log(`${label("homepage")}${chalk.cyan(c.homepage)}`);
  }
  if (c.documentation) {
    console.log(`${label("documentation")}${chalk.cyan(c.documentation)}`);
  }

  if (c.dependencies.length > 0) {
    console.log("");
    console.log(
      `${label("dependencies")}${c.dependencies.map((dep) => `${dep.name}${chalk.gray("@")}${dep.version || dep.repo}`).join(", ")}`,
    );
  }
  if (c.devDependencies.length > 0) {
    console.log(
      `${label("dev-deps")}${c.devDependencies.map((dep) => `${dep.name}${chalk.gray("@")}${dep.version || dep.repo}`).join(", ")}`,
    );
  }

  if (c.keywords.length > 0) {
    console.log("");
    console.log(
      `${label("keywords")}${c.keywords.map((k) => chalk.yellow(k)).join(", ")}`,
    );
  }

  if (d.versions.length > 0) {
    let versionsDisplay = d.versions.slice(-10).reverse().join(", ");
    let extra =
      d.versions.length > 10
        ? ` ${chalk.gray(`(+${d.versions.length - 10} more)`)}`
        : "";
    console.log("");
    console.log(`${label("versions")}${versionsDisplay}${extra}`);
  }

  console.log("");
}
