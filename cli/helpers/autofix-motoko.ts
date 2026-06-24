import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { TextDocument } from "vscode-languageserver-textdocument";

interface MocSpan {
  file: string;
  // Optional: older moc versions don't emit byte offsets.
  byte_start?: number | null;
  byte_end?: number | null;
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

export function parseDiagnostics(stdout: string | undefined): MocDiagnostic[] {
  if (!stdout) {
    return [];
  }
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

interface Edit {
  span: MocSpan;
  newText: string;
}

interface DiagnosticFix {
  code: string;
  edits: Edit[];
}

function extractDiagnosticFixes(
  diagnostics: MocDiagnostic[],
): Map<string, DiagnosticFix[]> {
  const result = new Map<string, DiagnosticFix[]>();

  for (const diag of diagnostics) {
    const editsByFile = new Map<string, Edit[]>();

    for (const span of diag.spans) {
      if (
        span.suggestion_applicability !== "MachineApplicable" ||
        span.suggested_replacement === null
      ) {
        continue;
      }
      const file = resolve(span.file);
      const edits = editsByFile.get(file) ?? [];
      edits.push({ span, newText: span.suggested_replacement });
      editsByFile.set(file, edits);
    }

    for (const [file, edits] of editsByFile) {
      const existing = result.get(file) ?? [];
      existing.push({ code: diag.code, edits });
      result.set(file, existing);
    }
  }

  return result;
}

interface OffsetEdit {
  start: number;
  end: number;
  newText: string;
}

/**
 * Applies diagnostic fixes to a file's contents, processing each diagnostic as
 * an atomic unit. If any edit from a diagnostic overlaps with an already-accepted
 * edit, the entire diagnostic is skipped (picked up in subsequent iterations).
 * Based on vscode-languageserver-textdocument's TextDocument.applyEdits.
 *
 * Edits prefer `byte_start`/`byte_end` (byte-accurate on any UTF-8 source);
 * falls back to line+column for older moc, which mis-applies on non-ASCII
 * lines since moc's `column_*` are bytes but LSP expects UTF-16 code units.
 */
function applyDiagnosticFixes(
  content: string,
  fixes: DiagnosticFix[],
): { text: string; appliedCodes: string[] } {
  let buf: Buffer | null = null;
  const byteToOffset = (byteOffset: number): number => {
    buf ??= Buffer.from(content, "utf8");
    return buf.subarray(0, byteOffset).toString("utf8").length;
  };
  let doc: TextDocument | null = null;

  const toOffsetEdit = ({ span, newText }: Edit): OffsetEdit => {
    if (span.byte_start != null && span.byte_end != null) {
      const [s, e] =
        span.byte_start <= span.byte_end
          ? [span.byte_start, span.byte_end]
          : [span.byte_end, span.byte_start];
      return { start: byteToOffset(s), end: byteToOffset(e), newText };
    }
    doc ??= TextDocument.create("inmemory://autofix", "motoko", 0, content);
    const start = doc.offsetAt({
      line: span.line_start - 1,
      character: span.column_start - 1,
    });
    const end = doc.offsetAt({
      line: span.line_end - 1,
      character: span.column_end - 1,
    });
    return start <= end
      ? { start, end, newText }
      : { start: end, end: start, newText };
  };

  const acceptedEdits: OffsetEdit[] = [];
  const appliedCodes: string[] = [];

  for (const fix of fixes) {
    const offsets = fix.edits.map(toOffsetEdit);

    const overlaps = offsets.some((o) =>
      acceptedEdits.some((a) => o.start < a.end && o.end > a.start),
    );
    if (overlaps) {
      continue;
    }

    acceptedEdits.push(...offsets);
    appliedCodes.push(fix.code);
  }

  acceptedEdits.sort((a, b) => a.start - b.start);

  const spans: string[] = [];
  let lastOffset = 0;

  for (const edit of acceptedEdits) {
    if (edit.start < lastOffset) {
      continue;
    }
    if (edit.start > lastOffset) {
      spans.push(content.substring(lastOffset, edit.start));
    }
    if (edit.newText.length) {
      spans.push(edit.newText);
    }
    lastOffset = edit.end;
  }

  spans.push(content.substring(lastOffset));
  return { text: spans.join(""), appliedCodes };
}

const MAX_FIX_ITERATIONS = 10;

export interface AutofixResult {
  /** Map of file path → diagnostic codes fixed in that file */
  fixedFiles: Map<string, string[]>;
  totalFixCount: number;
}

export async function autofixMotoko(
  mocPath: string,
  files: string[],
  mocArgs: string[],
): Promise<AutofixResult | null> {
  const fixedFilesCodes = new Map<string, string[]>();
  // Frozen migration files are often chmod'd read-only; warn once and skip
  // them rather than aborting the whole run on EACCES/EPERM.
  const readOnlySkipped = new Set<string>();

  for (let iteration = 0; iteration < MAX_FIX_ITERATIONS; iteration++) {
    const fixesByFile = new Map<string, DiagnosticFix[]>();

    for (const file of files) {
      const result = await execa(
        mocPath,
        [file, ...mocArgs, "--error-format=json"],
        { stdio: "pipe", reject: false },
      );

      const diagnostics = parseDiagnostics(result.stdout);
      for (const [targetFile, fixes] of extractDiagnosticFixes(diagnostics)) {
        const existing = fixesByFile.get(targetFile) ?? [];
        existing.push(...fixes);
        fixesByFile.set(targetFile, existing);
      }
    }

    if (fixesByFile.size === 0) {
      break;
    }

    let progress = false;

    for (const [file, fixes] of fixesByFile) {
      if (readOnlySkipped.has(file)) {
        continue;
      }

      const original = await readFile(file, "utf-8");
      const { text: result, appliedCodes } = applyDiagnosticFixes(
        original,
        fixes,
      );

      if (result === original) {
        continue;
      }

      try {
        await writeFile(file, result, "utf-8");
      } catch (err: any) {
        if (err?.code === "EACCES" || err?.code === "EPERM") {
          readOnlySkipped.add(file);
          console.warn(
            chalk.yellow(
              `Skipped read-only file ${relative(process.cwd(), file)} (${appliedCodes.length} fix(es) not applied)`,
            ),
          );
          continue;
        }
        throw err;
      }
      progress = true;

      const existing = fixedFilesCodes.get(file) ?? [];
      existing.push(...appliedCodes);
      fixedFilesCodes.set(file, existing);
    }

    if (!progress) {
      break;
    }
  }

  if (fixedFilesCodes.size === 0) {
    return null;
  }

  let totalFixCount = 0;
  for (const codes of fixedFilesCodes.values()) {
    totalFixCount += codes.length;
  }

  return {
    fixedFiles: fixedFilesCodes,
    totalFixCount,
  };
}
