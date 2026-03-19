import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";
import {
  TextDocument,
  type TextEdit,
} from "vscode-languageserver-textdocument";

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

interface DiagnosticFix {
  code: string;
  edits: TextEdit[];
}

function extractDiagnosticFixes(
  diagnostics: MocDiagnostic[],
): Map<string, DiagnosticFix[]> {
  const result = new Map<string, DiagnosticFix[]>();

  for (const diag of diagnostics) {
    const editsByFile = new Map<string, TextEdit[]>();

    for (const span of diag.spans) {
      if (
        span.suggestion_applicability === "MachineApplicable" &&
        span.suggested_replacement !== null
      ) {
        const file = resolve(span.file);
        const edits = editsByFile.get(file) ?? [];
        edits.push({
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
        });
        editsByFile.set(file, edits);
      }
    }

    for (const [file, edits] of editsByFile) {
      const existing = result.get(file) ?? [];
      existing.push({ code: diag.code, edits });
      result.set(file, existing);
    }
  }

  return result;
}

type Range = TextEdit["range"];

function normalizeRange(range: Range): Range {
  const { start, end } = range;
  if (
    start.line > end.line ||
    (start.line === end.line && start.character > end.character)
  ) {
    return { start: end, end: start };
  }
  return range;
}

interface OffsetEdit {
  start: number;
  end: number;
  newText: string;
}

/**
 * Applies diagnostic fixes to a document, processing each diagnostic as
 * an atomic unit. If any edit from a diagnostic overlaps with an already-accepted
 * edit, the entire diagnostic is skipped (picked up in subsequent iterations).
 * Based on vscode-languageserver-textdocument's TextDocument.applyEdits.
 */
function applyDiagnosticFixes(
  doc: TextDocument,
  fixes: DiagnosticFix[],
): { text: string; appliedCodes: string[] } {
  const acceptedEdits: OffsetEdit[] = [];
  const appliedCodes: string[] = [];

  for (const fix of fixes) {
    const offsets: OffsetEdit[] = fix.edits.map((e) => {
      const range = normalizeRange(e.range);
      return {
        start: doc.offsetAt(range.start),
        end: doc.offsetAt(range.end),
        newText: e.newText,
      };
    });

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

  const text = doc.getText();
  const spans: string[] = [];
  let lastOffset = 0;

  for (const edit of acceptedEdits) {
    if (edit.start < lastOffset) {
      continue;
    }
    if (edit.start > lastOffset) {
      spans.push(text.substring(lastOffset, edit.start));
    }
    if (edit.newText.length) {
      spans.push(edit.newText);
    }
    lastOffset = edit.end;
  }

  spans.push(text.substring(lastOffset));
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
      const original = await readFile(file, "utf-8");
      const doc = TextDocument.create(`file://${file}`, "motoko", 0, original);
      const { text: result, appliedCodes } = applyDiagnosticFixes(doc, fixes);

      if (result === original) {
        continue;
      }

      await writeFile(file, result, "utf-8");
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
