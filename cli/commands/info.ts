import process from "node:process";
import chalk from "chalk";
import { mainActor } from "../api/actors.js";
import { resolveVersion } from "../api/resolveVersion.js";
import type { PackageDetails, User } from "../declarations/main/main.did.js";

function formatUser(user: User): string {
  let name =
    user.name ||
    user.displayName ||
    (user.github ? `@${user.github}` : "unknown");
  let parts = [name];
  if (user.github) {
    parts.push(chalk.gray(`(github.com/${user.github})`));
  }
  return parts.join(" ");
}

function formatDate(time: bigint): string {
  return new Date(Number(time / 1_000_000n)).toISOString().split("T")[0]!;
}

function formatSize(bytes: bigint): string {
  let n = Number(bytes);
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDownloads(n: bigint): string {
  let num = Number(n);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return String(num);
}

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

  if (options.versions) {
    printVersions(d.versions);
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

  console.log(
    `${label("published")}${formatDate(d.publication.time)} by ${formatUser(d.publisher)}`,
  );

  if (d.owners.length > 0) {
    let owners = d.owners.map(formatUser).join(", ");
    console.log(`${label("owners")}${owners}`);
  }
  if (d.maintainers.length > 0) {
    let maintainers = d.maintainers.map(formatUser).join(", ");
    console.log(`${label("maintainers")}${maintainers}`);
  }

  console.log("");
  console.log(
    `${label("downloads")}${formatDownloads(d.downloadsTotal)} total  ${chalk.gray("|")}  ${formatDownloads(d.downloadsInLast30Days)} last 30d  ${chalk.gray("|")}  ${formatDownloads(d.downloadsInLast7Days)} last 7d`,
  );

  if (d.dependentsCount > 0n) {
    console.log(
      `${label("dependents")}${d.dependentsCount.toString()} package${d.dependentsCount > 1n ? "s" : ""}`,
    );
  }

  console.log(
    `${label("files")}${d.fileStats.sourceFiles.toString()} source files (${formatSize(d.fileStats.sourceSize)})`,
  );

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

  let q = d.quality;
  let qualityItems: string[] = [];
  if (q.hasTests) {
    qualityItems.push(chalk.green("tests"));
  }
  if (q.hasDocumentation) {
    qualityItems.push(chalk.green("docs"));
  }
  if (q.hasRepository) {
    qualityItems.push(chalk.green("repo"));
  }
  if (q.hasLicense) {
    qualityItems.push(chalk.green("license"));
  }
  if (q.hasReleaseNotes) {
    qualityItems.push(chalk.green("release notes"));
  }
  if (qualityItems.length > 0) {
    console.log("");
    console.log(`${label("quality")}${qualityItems.join(chalk.gray("  ·  "))}`);
  }

  if (d.changes.notes) {
    console.log("");
    console.log(`${label("release notes")}${d.changes.notes}`);
  }

  if (c.moc || c.dfx) {
    console.log("");
    if (c.moc) {
      console.log(`${label("moc")}${c.moc}`);
    }
    if (c.dfx) {
      console.log(`${label("dfx")}${c.dfx}`);
    }
  }

  console.log("");
}

function printVersions(versions: string[]): void {
  for (let ver of versions) {
    console.log(ver);
  }
}
