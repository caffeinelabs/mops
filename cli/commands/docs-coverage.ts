import { readFileSync } from "node:fs";
import chalk from "chalk";
import { globSync } from "glob";
import { docs } from "./docs.js";
import { cliError } from "../error.js";

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
    format: "adoc",
    silent: true,
  });

  let files = globSync(`${docsDir}/**/*.adoc`, {
    ignore: [`${docsDir}/**/*.test.adoc`, `${docsDir}/test/**/*`],
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
    cliError();
  }

  return totalCoverage;
}

function docFileCoverage(file: string) {
  let content = readFileSync(file, "utf-8");

  // Module name is on the line after the [[module.*]] anchor
  let module =
    content.match(/^\[\[module\.[^\]]+\]\]\n= (.+)$/m)?.[1]?.trim() || "";
  let moduleFile = `${module}.mo`;

  // Split into per-declaration sections at every [[id]] that is NOT [[module.*]]
  let sections = content.split(/^(?=\[\[(?!module\.))/m).slice(1);

  let items = sections.map((section) => {
    let rawId = section.match(/^\[\[([^\]]+)\]\]/)?.[1] ?? "";
    let id = rawId.replace(/^type\./, "");
    // mo-doc anchors types as [[type.X]]; classes/values have no prefix → "func"
    let type = rawId.startsWith("type.") ? "type" : "func";
    let definition = section.match(/^== (.+)$/m)?.[1]?.trim() ?? "";

    // Text after the closing ---- is the doc comment (empty when undocumented).
    // slice(2).join preserves any ---- that appears inside the comment itself.
    let parts = section.split(/^----$/m);
    let comment = parts.slice(2).join("----").trim();

    return {
      file: moduleFile,
      id,
      type,
      definition,
      comment,
      covered: comment.length >= 5,
    };
  });

  let coverage = !items.length
    ? 100
    : (items.filter((item) => item.covered).length / items.length) * 100;

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
