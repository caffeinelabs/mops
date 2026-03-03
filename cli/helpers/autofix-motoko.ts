import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";
import {
  TextDocument,
  type TextEdit,
} from "vscode-languageserver-textdocument";

interface Fix {
  file: string;
  code: string;
  edit: TextEdit;
}

interface MocSpan {
  file: string;
  line_start: number;
  column_start: number;
  line_end: number;
  column_end: number;
  is_primary: boolean;
  label: string | null;
  suggested_replacement: string | null;
  suggestion_applicability: string | null;
}

export interface MocDiagnostic {
  message: string;
  code: string;
  level: string;
  spans: MocSpan[];
  notes: string[];
}

export function parseDiagnostics(stdout: string): MocDiagnostic[] {
  return stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as MocDiagnostic;
      } catch {
        return null;
      }
    })
    .filter((d) => d !== null);
}

function extractFixes(diagnostics: MocDiagnostic[]): Fix[] {
  const fixes: Fix[] = [];
  for (const diag of diagnostics) {
    for (const span of diag.spans) {
      if (
        span.suggestion_applicability === "MachineApplicable" &&
        span.suggested_replacement !== null
      ) {
        fixes.push({
          file: span.file,
          code: diag.code,
          edit: {
            range: {
              start: {
                line: span.line_start - 1,
                character: span.column_start - 1,
              },
              end: {
                line: span.line_end - 1,
                character: span.column_end - 1,
              },
            },
            newText: span.suggested_replacement,
          },
        });
      }
    }
  }
  return fixes;
}

const MAX_FIX_ITERATIONS = 10;

export async function autofixMotoko(
  mocPath: string,
  files: string[],
  mocArgs: string[],
): Promise<{
  fixedCount: number;
  fixedDiagnosticCounts: Record<string, number>;
} | null> {
  const fixedFiles = new Set<string>();
  const totalFixedCodes: Record<string, number> = {};

  for (let iteration = 0; iteration < MAX_FIX_ITERATIONS; iteration++) {
    const allFixes: Fix[] = [];

    for (const file of files) {
      const result = await execa(
        mocPath,
        [file, "--error-format=json", ...mocArgs],
        { stdio: "pipe", reject: false },
      );

      const diagnostics = parseDiagnostics(result.stdout);
      allFixes.push(...extractFixes(diagnostics));
    }

    if (allFixes.length === 0) {
      break;
    }

    const fixesByFile = new Map<string, Fix[]>();
    for (const fix of allFixes) {
      const normalizedPath = resolve(fix.file);
      const existing = fixesByFile.get(normalizedPath) ?? [];
      existing.push(fix);
      fixesByFile.set(normalizedPath, existing);
    }

    let progress = false;

    for (const [file, fixes] of fixesByFile) {
      const original = await readFile(file, "utf-8");
      const doc = TextDocument.create(`file://${file}`, "motoko", 0, original);

      let result: string;
      try {
        result = TextDocument.applyEdits(
          doc,
          fixes.map((f) => f.edit),
        );
      } catch (err) {
        console.warn(`Warning: could not apply fixes to ${file}: ${err}`);
        continue;
      }

      if (result === original) {
        continue;
      }

      await writeFile(file, result, "utf-8");
      fixedFiles.add(file);
      progress = true;

      for (const fix of fixes) {
        totalFixedCodes[fix.code] = (totalFixedCodes[fix.code] ?? 0) + 1;
      }
    }

    if (!progress) {
      break;
    }
  }

  if (fixedFiles.size === 0) {
    return null;
  }

  return {
    fixedCount: fixedFiles.size,
    fixedDiagnosticCounts: totalFixedCodes,
  };
}
