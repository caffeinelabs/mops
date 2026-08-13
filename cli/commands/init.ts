import process from "node:process";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import prompts from "prompts";

import { writeConfig } from "../mops.js";
import { Config } from "../types.js";
import { template } from "./template.js";
import { kebabCase } from "change-case";
import { cliAbort } from "../error.js";

export async function init({ yes = false } = {}) {
  let configFile = path.join(process.cwd(), "mops.toml");
  let exists = existsSync(configFile);
  if (exists) {
    console.log(chalk.yellow("mops.toml already exists"));
    return;
  }

  console.log("Initializing...");

  let config: Config = {};

  if (yes) {
    await applyInit({
      type: "project",
      config,
      setupWorkflow: true,
      addTest: false,
      copyrightOwner: "",
    });
    return;
  }

  let promptsConfig = {
    onCancel() {
      cliAbort();
    },
  };

  // type
  let { type } = await prompts(
    {
      type: "select",
      name: "type",
      message: "Select type:",
      choices: [
        {
          title: `Project ${chalk.dim("(I just want to use mops packages in my project)")}`,
          value: "project",
        },
        {
          title: `Package ${chalk.dim("(I plan to publish this package on mops)")}`,
          value: "package",
        },
      ],
    },
    promptsConfig,
  );

  let addTest = false;
  let copyrightOwner = "";

  // package details
  if (type === "package") {
    let res = await prompts(
      [
        {
          type: "text",
          name: "name",
          message: "Enter package name:",
          initial: kebabCase(path.basename(process.cwd())),
        },
        {
          type: "text",
          name: "description",
          message: "Enter package description:",
          initial: "",
        },
        {
          type: "text",
          name: "repository",
          message: "Enter package repository url:",
          initial: "",
        },
        {
          type: "text",
          name: "keywords",
          message: "Enter keywords separated by spaces:",
          initial: "",
        },
        {
          type: "select",
          name: "license",
          message: "Choose a license:",
          choices: [
            { title: "MIT", value: "MIT" },
            { title: "Apache-2.0", value: "Apache-2.0" },
          ],
          initial: 0,
        },
        {
          type: "text",
          name: "copyrightOwner",
          message: "Enter license copyright owner:",
          initial: "",
        },
        {
          type: "confirm",
          name: "addTest",
          message: `Add example test file? ${chalk.dim("(test/lib.test.mo)")}`,
          initial: true,
        },
      ],
      promptsConfig,
    );

    config.package = {
      name: kebabCase((res.name || "").trim()),
      version: "1.0.0",
      description: (res.description || "").trim(),
      repository: (res.repository || "").trim(),
      keywords: [
        ...new Set(res.keywords.split(" ").filter(Boolean)),
      ] as string[],
      license: (res.license || "").trim(),
    };

    addTest = res.addTest;
    copyrightOwner = res.copyrightOwner;
  }

  // GitHub workflow
  let { setupWorkflow } = await prompts(
    {
      type: "confirm",
      name: "setupWorkflow",
      message: `Setup GitHub workflow? ${chalk.dim("(run `mops test` on push)")}`,
      initial: true,
    },
    promptsConfig,
  );

  await applyInit({
    type,
    config,
    setupWorkflow,
    addTest,
    copyrightOwner,
  });
}

type ApplyInitOptions = {
  type: "project" | "package";
  config: Config;
  setupWorkflow: boolean;
  addTest: boolean;
  copyrightOwner: string;
};

async function applyInit({
  type,
  config,
  setupWorkflow,
  addTest,
  copyrightOwner,
}: ApplyInitOptions) {
  // save config
  let configFile = path.join(process.cwd(), "mops.toml");
  writeConfig(config, configFile);
  console.log(chalk.green("Created"), "mops.toml");

  // add src/lib.mo
  if (type === "package" && !existsSync(path.join(process.cwd(), "src"))) {
    await template("lib.mo");
  }

  // add src/lib.test.mo
  if (addTest && !existsSync(path.join(process.cwd(), "test"))) {
    await template("lib.test.mo");
  }

  // add license
  if (config.package?.license) {
    await template(`license:${config.package.license}`, { copyrightOwner });
  }

  // add readme
  if (type === "package") {
    await template("readme");
  }

  // add GitHub workflow
  if (setupWorkflow) {
    await template("github-workflow:mops-test");
  }

  // add mops-managed paths to .gitignore
  {
    let gitignore = path.join(process.cwd(), ".gitignore");
    let gitignoreData = existsSync(gitignore)
      ? readFileSync(gitignore).toString()
      : "";
    const additions: string[] = [];
    if (!gitignoreData.includes(".mops")) {
      additions.push(".mops");
    }
    if (!gitignoreData.includes(".migrations-")) {
      additions.push(".migrations-*/");
    }
    if (additions.length > 0) {
      let lf = gitignoreData.endsWith("\n") ? "\n" : "";
      writeFileSync(
        gitignore,
        `${gitignoreData}\n${additions.join("\n")}${lf}`.trimStart(),
      );
      console.log(
        chalk.green("Added"),
        `${additions.join(", ")} to .gitignore`,
      );
    }
  }

  console.log(chalk.green("Done!"));
}
