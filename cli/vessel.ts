import process from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execaCommand } from "execa";
import { parseGithubURL } from "./mops.js";

const dhallFileToJson = async (filePath: string, silent: boolean) => {
  if (existsSync(filePath)) {
    let cwd = new URL(path.dirname(import.meta.url)).pathname;
    let res;
    try {
      res = await execaCommand(`dhall-to-json --file ${filePath}`, {
        preferLocal: true,
        cwd,
      });
    } catch (err: any) {
      silent ||
        console.error(
          "dhall-to-json error:",
          err.message?.split("Message:")[0],
        );
      return null;
    }

    if (res.exitCode === 0) {
      return JSON.parse(res.stdout);
    } else {
      return res;
    }
  }

  return null;
};

export type VesselConfig = {
  dependencies: VesselDependencies;
  "dev-dependencies": VesselDependencies;
};

export type VesselDependencies = Array<{
  name: string;
  version?: string; // mops package
  repo?: string; // github package
  path?: string; // local package
}>;

export const readVesselConfig = async (
  dir: string,
  { cache = true, silent = false } = {},
): Promise<VesselConfig | null> => {
  const cachedFile = (dir || process.cwd()) + "/vessel.json";

  if (existsSync(cachedFile)) {
    let cachedConfig = readFileSync(cachedFile).toString();
    return JSON.parse(cachedConfig);
  }

  const [vessel, packageSetArray] = await Promise.all([
    dhallFileToJson((dir || process.cwd()) + "/vessel.dhall", silent),
    dhallFileToJson((dir || process.cwd()) + "/package-set.dhall", silent),
  ]);

  if (!vessel || !packageSetArray) {
    return null;
  }

  let repos: Record<string, string> = {};
  for (const { name, repo, version } of packageSetArray) {
    const { org, gitName } = parseGithubURL(repo);
    repos[name] = `https://github.com/${org}/${gitName}#${version}`;
  }

  let config: VesselConfig = {
    dependencies: vessel.dependencies.map((name: string) => {
      return { name, repo: repos[name], version: "" };
    }),
    "dev-dependencies": [],
  };

  if (cache === true) {
    writeFileSync(cachedFile, JSON.stringify(config), "utf-8");
  }

  return config;
};
