import { readFileSync, writeFileSync } from "node:fs";
import { execa } from "execa";

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Fix {
  file: string;
  code: string;
  range: Range;
  replacement: string;
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

class FileContent {
  constructor(public readonly content: string) {}

  private lines: string[] | undefined;
  private lineOffsets: number[] | undefined;

  getLines(): string[] {
    this.lines ??= this.content.split("\n");
    return this.lines;
  }

  getLineOffsets(): number[] {
    if (!this.lineOffsets) {
      let currentOffset = 0;
      this.lineOffsets = this.getLines().map((l) => {
        const off = currentOffset;
        currentOffset += l.length + 1;
        return off;
      });
    }
    return this.lineOffsets;
  }

  getOffset(pos: Position): number {
    const offsets = this.getLineOffsets();
    if (pos.line >= offsets.length) {
      return this.content.length;
    }
    const offset = offsets[pos.line];
    return Math.min((offset ?? 0) + pos.character, this.content.length);
  }
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
          replacement: span.suggested_replacement,
        });
      }
    }
  }
  return fixes;
}

function applyFixes(
  content: FileContent,
  fixes: Fix[],
): { result: string; appliedCount: number; appliedCodes: Map<string, number> } {
  const sorted = [...fixes].sort(
    (a, b) =>
      b.range.start.line - a.range.start.line ||
      b.range.start.character - a.range.start.character,
  );

  let result = content.content;
  let appliedCount = 0;
  let lastFixStartOffset = Infinity;
  const appliedCodes = new Map<string, number>();

  for (const fix of sorted) {
    const start = content.getOffset(fix.range.start);
    const end = content.getOffset(fix.range.end);

    if (end > lastFixStartOffset) {
      continue;
    }

    result = result.slice(0, start) + fix.replacement + result.slice(end);
    lastFixStartOffset = start;
    appliedCount++;
    appliedCodes.set(fix.code, (appliedCodes.get(fix.code) ?? 0) + 1);
  }

  return { result, appliedCount, appliedCodes };
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
    const content = new FileContent(readFileSync(file, "utf-8"));
    const { result, appliedCount, appliedCodes } = applyFixes(content, fixes);

    if (appliedCount === 0) {
      continue;
    }

    writeFileSync(file, result, "utf-8");
    totalFixedFiles++;

    for (const [code, count] of appliedCodes) {
      totalFixedCodes[code] = (totalFixedCodes[code] ?? 0) + count;
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
