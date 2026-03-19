import { readFileSync } from "node:fs";
import chalk from "chalk";
import { globSync } from "glob";
import { JSDOM } from "jsdom";
import { docs } from "./docs.js";

export type DocsCoverageReporter =
  | "compact"
  | "files"
  | "missing"
  | "verbose"
  | "silent";

type DocsCoverageOptions = {
  source: string;
  reporter: DocsCoverageReporter;
  threshold: number;
};

export async function docsCoverage(options: Partial<DocsCoverageOptions> = {}) {
  let docsDir = ".mops/.docs";

  let { source, reporter, threshold } = {
    source: "src",
    reporter: "files",
    threshold: 0,
    ...options,
  };

  await docs({
    source,
    output: docsDir,
    format: "html",
    silent: true,
  });

  let files = globSync(`${docsDir}/**/*.html`, {
    ignore: [`${docsDir}/**/index.html`],
  });
  let coverages = [];

  for (let file of files) {
    let coverage = docFileCoverage(file);
    coverages.push(coverage);

    if (reporter === "silent") {
      continue;
    }
    if (
      reporter !== "compact" &&
      (reporter !== "missing" || coverage.coverage < 100)
    ) {
      console.log(`• ${coverage.file} ${colorizeCoverage(coverage.coverage)}`);
    }
    if (reporter === "missing" && coverage.coverage < 100) {
      for (let item of coverage.items) {
        if (!item.covered) {
          console.log(
            `  ${item.covered ? chalk.green("✓") : chalk.red("✖")} ${item.id} ${chalk.gray(item.type)}`,
          );
        }
      }
    } else if (reporter === "verbose") {
      for (let item of coverage.items) {
        console.log(
          `  ${item.covered ? chalk.green("✓") : chalk.red("✖")} ${item.id} ${chalk.gray(item.type)}`,
        );
      }
    }
  }

  if (reporter !== "compact" && reporter !== "silent") {
    console.log("-".repeat(50));
  }

  let totalCoverage =
    coverages.reduce((acc, coverage) => acc + coverage.coverage, 0) /
    (coverages.length || 1);
  if (reporter !== "silent") {
    console.log(`Documentation coverage: ${colorizeCoverage(totalCoverage)}`);
  }

  if (threshold > 0 && totalCoverage < threshold) {
    process.exit(1);
  }

  return totalCoverage;
}

function docFileCoverage(file: string) {
  let dom = new JSDOM(readFileSync(file, "utf-8"));

  let module = dom.window.document.querySelector("h1")?.textContent || "";
  let moduleFile = `${module}.mo`;

  let items = [...dom.window.document.querySelectorAll("h4")].map((h4) => {
    let id = h4.getAttribute("id")?.replace("type.", "");
    let type = h4.className
      .replace("-declaration", "")
      .replace("function", "func");
    let definition = h4.textContent;
    let comment = h4.parentElement?.querySelector("p + p")?.textContent;
    return {
      file: moduleFile,
      id,
      type,
      definition,
      comment,
      covered: (comment || "").length >= 5,
    };
  });

  let coverage = 0;
  if (!items.length) {
    coverage = 100;
  } else {
    coverage =
      (items.filter((item) => item.covered).length / items.length) * 100;
  }

  return { file: moduleFile, coverage, items };
}

function colorizeCoverage(coverage: number) {
  if (coverage >= 90) {
    return chalk.green(coverage.toFixed(2) + "%");
  } else if (coverage >= 50) {
    return chalk.yellow(coverage.toFixed(2) + "%");
  } else {
    return chalk.red(coverage.toFixed(2) + "%");
  }
}
