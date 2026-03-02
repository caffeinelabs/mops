import { readFileSync, writeFileSync } from "node:fs";
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

export async function autofixMotoko(
  mocPath: string,
  files: string[],
  mocArgs: string[],
): Promise<{
  fixedCount: number;
  fixedErrorCounts: Record<string, number>;
} | null> {
  const allFixes: Fix[] = [];

  for (const file of files) {
    const result = await execa(
      mocPath,
      [file, "--error-format=json", "--all-libs", ...mocArgs],
      { stdio: "pipe", reject: false },
    );

    const diagnostics = parseDiagnostics(result.stdout);
    allFixes.push(...extractFixes(diagnostics));
  }

  if (allFixes.length === 0) {
    return null;
  }

  const fixesByFile = new Map<string, Fix[]>();
  for (const fix of allFixes) {
    const existing = fixesByFile.get(fix.file) ?? [];
    existing.push(fix);
    fixesByFile.set(fix.file, existing);
  }

  let totalFixedFiles = 0;
  const totalFixedCodes: Record<string, number> = {};

  for (const [file, fixes] of fixesByFile) {
    const original = readFileSync(file, "utf-8");
    const doc = TextDocument.create(`file://${file}`, "motoko", 0, original);
    const result = TextDocument.applyEdits(
      doc,
      fixes.map((f) => f.edit),
    );

    if (result === original) {
      continue;
    }

    writeFileSync(file, result, "utf-8");
    totalFixedFiles++;

    for (const fix of fixes) {
      totalFixedCodes[fix.code] = (totalFixedCodes[fix.code] ?? 0) + 1;
    }
  }

  if (totalFixedFiles === 0) {
    return null;
  }

  return {
    fixedCount: totalFixedFiles,
    fixedErrorCounts: totalFixedCodes,
  };
}
