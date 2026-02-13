import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface TextEdit {
  range: Range;
  newText: string;
}

interface Diagnostic {
  file: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  code: string;
  message: string;
}

interface CodeFix extends TextEdit {
  code: string;
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

  textAt(range: Range): string {
    const start = this.getOffset(range.start);
    const end = this.getOffset(range.end);
    return this.content.substring(start, end);
  }

  lineAt(line: number): string {
    const lines = this.getLines();
    return lines[line] ?? "";
  }
}

function rangeFromDiagnostic(diag: Diagnostic): Range {
  return {
    start: { line: diag.startLine - 1, character: diag.startChar - 1 },
    end: { line: diag.endLine - 1, character: diag.endChar - 1 },
  };
}

export class MotokoFixer {
  private readonly supportedCodes1 = ["M0223"];
  private readonly supportedCodes2 = ["M0236", "M0237"];
  private readonly initialErrorCounts = new Map<string, number>();
  private readonly fixedErrorCounts = new Map<string, number>();
  private readonly fileContentCache = new Map<string, FileContent>();

  public fix(
    files: Map<string, string>,
    errorOutput: string,
  ): {
    fixedFiles: Map<string, string>;
    fixedErrorCounts: Record<string, number>;
  } | null {
    this.initialErrorCounts.clear();
    this.fixedErrorCounts.clear();
    this.fileContentCache.clear();

    const allDiagnostics = this.parseDiagnostics(errorOutput);
    if (allDiagnostics.length === 0) {
      return null;
    }

    for (const diag of allDiagnostics) {
      this.initialErrorCounts.set(
        diag.code,
        (this.initialErrorCounts.get(diag.code) ?? 0) + 1,
      );
    }

    const fixedFiles = new Map<string, string>();
    const diagnosticsByFile = allDiagnostics.reduce((acc, diag) => {
      const current = acc.get(diag.file) ?? [];
      current.push(diag);
      acc.set(diag.file, current);
      return acc;
    }, new Map<string, Diagnostic[]>());

    for (const [file, diagnostics] of diagnosticsByFile) {
      const fileKey = this.findFileKey(files, file);
      if (!fileKey) {
        continue;
      }

      let fileContent = this.getFileContent(files, fileKey);
      if (!fileContent) {
        continue;
      }

      // Phase 1: Apply simple fixes first to avoid overlapping fixes
      const diagnostics1 = diagnostics.filter((diag) =>
        this.supportedCodes1.includes(diag.code),
      );
      let fixes1 = this.generateFixes(diagnostics1, fileContent);
      if (fixes1.length > 0) {
        const result1 = this.applyFixes(fileContent, fixes1);
        fixes1 = result1.applied;
        fixedFiles.set(fileKey, result1.content);
        fileContent = this.setFileContent(result1.content, fileKey);
      }

      // Phase 2: Apply more complex fixes
      let diagnostics2 = diagnostics.filter((diag) =>
        this.supportedCodes2.includes(diag.code),
      );
      diagnostics2 = this.adjustDiagnosticPositions(diagnostics2, fixes1);
      const fixes2 = this.generateFixes(diagnostics2, fileContent);
      if (fixes2.length === 0) {
        continue;
      }
      fixedFiles.set(fileKey, this.applyFixes(fileContent, fixes2).content);
    }

    if (fixedFiles.size === 0) {
      return null;
    }

    return {
      fixedFiles,
      fixedErrorCounts: Object.fromEntries(this.fixedErrorCounts),
    };
  }

  private findFileKey(
    files: Map<string, string>,
    fileName: string,
  ): string | null {
    // Try exact match first
    if (files.has(fileName)) {
      return fileName;
    }

    // Try matching the end of the file path
    for (const key of files.keys()) {
      if (key.endsWith(fileName) || key.endsWith(`/${fileName}`)) {
        return key;
      }
    }

    return null;
  }

  private generateFix(
    diag: Diagnostic,
    fileContent: FileContent,
  ): TextEdit | null {
    switch (diag.code) {
      case "M0223":
        return this.fixRedundantTypeInstantiation(diag);
      case "M0236":
        return this.fixDotNotationSuggestion(diag, fileContent);
      case "M0237":
        return this.fixRedundantImplicitArgument(diag, fileContent);
      default:
        return null;
    }
  }

  private generateFixes(
    diagnostics: Diagnostic[],
    fileContent: FileContent,
  ): CodeFix[] {
    const fixes: CodeFix[] = [];
    for (const diag of diagnostics) {
      const fix = this.generateFix(diag, fileContent);
      if (fix) {
        fixes.push({ ...fix, code: diag.code });
      }
    }
    // Sort by start position descending (bottom-up)
    return fixes.sort(
      (a, b) =>
        b.range.start.line - a.range.start.line ||
        b.range.start.character - a.range.start.character,
    );
  }

  private fixRedundantTypeInstantiation(diag: Diagnostic): TextEdit {
    return { range: rangeFromDiagnostic(diag), newText: "" };
  }

  private fixDotNotationSuggestion(
    diag: Diagnostic,
    fileContent: FileContent,
  ): TextEdit | null {
    const range = rangeFromDiagnostic(diag);
    const originalText = fileContent.textAt(range);

    // Extract function name and first argument from the error message
    // The message format is typically: "suggestion: use dot notation: obj.method(...)"
    const match = originalText.match(/(\w+)\s*\(\s*(\w+)/);
    if (!match) {
      return null;
    }

    const funcName = match[1];

    // Simple replacement: convert func(obj, ...) to obj.func(...)
    const newText = originalText.replace(
      /(\w+)\s*\(\s*(\w+)/,
      `$2.${funcName}(`,
    );

    return { range, newText };
  }

  private fixRedundantImplicitArgument(
    diag: Diagnostic,
    fileContent: FileContent,
  ): TextEdit | null {
    const range = rangeFromDiagnostic(diag);

    this.extendRangeWithComma(range, fileContent);

    const textAfter = fileContent
      .lineAt(range.end.line)
      .substring(range.end.character);
    const textBefore = fileContent
      .lineAt(range.start.line)
      .substring(0, range.start.character);

    if (textBefore.trim() === "" && textAfter.trim() === "") {
      range.start.character = 0;
      range.end.line += 1;
      range.end.character = 0;
    }

    return { range, newText: "" };
  }

  private extendRangeWithComma(range: Range, fileContent: FileContent): void {
    const textAfter = fileContent
      .lineAt(range.end.line)
      .substring(range.end.character);
    const commaMatch = textAfter.match(/^\s*,\s*/);
    if (commaMatch) {
      range.end.character += commaMatch[0].length;
    }
  }

  public verifyFixes(newErrors: string): void {
    const newCounts = new Map<string, number>();
    for (const d of this.parseDiagnostics(newErrors)) {
      newCounts.set(d.code, (newCounts.get(d.code) ?? 0) + 1);
    }

    for (const [code, actualCount] of newCounts) {
      if (code === "M0223") {
        continue; // Cannot verify M0223 fixes
      }
      const initialCount = this.initialErrorCounts.get(code) ?? 0;
      const fixedCount = this.fixedErrorCounts.get(code) ?? 0;
      if (actualCount !== initialCount - fixedCount) {
        console.warn(
          `Warning: Incorrect error count for fix code ${code}: ` +
            `${actualCount} !== ${initialCount} - ${fixedCount}`,
        );
      }
    }
  }

  private parseDiagnostics(output: string): Diagnostic[] {
    const regex =
      /^([^:\n]+):(\d+)\.(\d+)-(\d+)\.(\d+): (?:type error|warning) \[(M\d+)\], (.+)$/gim;
    return Array.from(output.matchAll(regex)).map((m) => {
      const file = m[1] ?? "";
      const startLine = parseInt(m[2] ?? "0");
      const startChar = parseInt(m[3] ?? "0");
      const endLine = parseInt(m[4] ?? "0");
      const endChar = parseInt(m[5] ?? "0");
      const code = m[6] ?? "";
      const message = m[7] ?? "";
      return {
        file,
        startLine,
        startChar,
        endLine,
        endChar,
        code,
        message,
      };
    });
  }

  private applyFixes(
    fileContent: FileContent,
    fixes: CodeFix[],
  ): { content: string; applied: CodeFix[] } {
    let result = fileContent.content;
    const applied: CodeFix[] = [];
    let lastFixStartOffset = Infinity;

    for (const fix of fixes) {
      const start = fileContent.getOffset(fix.range.start);
      const end = fileContent.getOffset(fix.range.end);

      if (end > lastFixStartOffset) {
        continue;
      }

      result = result.slice(0, start) + fix.newText + result.slice(end);
      lastFixStartOffset = start;
      applied.push(fix);

      this.fixedErrorCounts.set(
        fix.code,
        (this.fixedErrorCounts.get(fix.code) ?? 0) + 1,
      );
    }
    return { content: result, applied };
  }

  private getFileContent(
    files: Map<string, string>,
    fileKey: string,
  ): FileContent | null {
    let fileContent = this.fileContentCache.get(fileKey);
    if (fileContent !== undefined) {
      return fileContent;
    }

    const content = files.get(fileKey);
    if (typeof content !== "string") {
      return null;
    }
    fileContent = new FileContent(content);
    this.fileContentCache.set(fileKey, fileContent);
    return fileContent;
  }

  private setFileContent(content: string, fileKey: string): FileContent {
    const fileContent = new FileContent(content);
    this.fileContentCache.set(fileKey, fileContent);
    return fileContent;
  }

  private adjustDiagnosticPositions(
    diagnostics: Diagnostic[],
    fixes: CodeFix[],
  ): Diagnostic[] {
    const removedFromStart: number[] = diagnostics.map(() => 0);
    const removedFromEnd: number[] = diagnostics.map(() => 0);

    for (const [index, diag] of diagnostics.entries()) {
      const startLine = diag.startLine - 1;
      const startChar = diag.startChar - 1;
      const endLine = diag.endLine - 1;
      const endChar = diag.endChar - 1;

      for (const fix of fixes) {
        if (fix.newText !== "") {
          continue;
        }
        if (fix.range.start.line !== fix.range.end.line) {
          continue;
        }

        const fixLine = fix.range.start.line;
        const fixLen = fix.range.end.character - fix.range.start.character;

        if (fixLine === startLine && fixLen <= startChar) {
          removedFromStart[index] = (removedFromStart[index] ?? 0) + fixLen;
        }

        if (fixLine === endLine && fixLen <= endChar) {
          removedFromEnd[index] = (removedFromEnd[index] ?? 0) + fixLen;
        }
      }
    }

    return diagnostics.map((diag, index) => ({
      ...diag,
      startChar: diag.startChar - (removedFromStart[index] ?? 0),
      endChar: diag.endChar - (removedFromEnd[index] ?? 0),
    }));
  }
}

export async function autofixMotoko(
  files: string[],
  compileErrors: (filePaths: string[]) => Promise<string | null>,
  baseDir: string = process.cwd(),
): Promise<{
  fixedCount: number;
  fixedErrorCounts: Record<string, number>;
} | null> {
  // Load file contents
  const fileContents = new Map<string, string>();
  const filePaths = new Map<string, string>(); // maps relative path to absolute path

  for (const file of files) {
    const absolutePath = file.startsWith("/") ? file : join(baseDir, file);
    const content = readFileSync(absolutePath, "utf-8");
    fileContents.set(file, content);
    filePaths.set(file, absolutePath);
  }

  let currentFiles = fileContents;
  let currentErrors = await compileErrors(files);
  let totalFixedCount = 0;
  const allFixedErrorCounts: Record<string, number> = {};

  const fixer = new MotokoFixer();
  const maxIterations = 10;

  for (let i = 0; i < maxIterations && currentErrors !== null; i++) {
    const fixResult = fixer.fix(currentFiles, currentErrors);
    if (!fixResult) {
      break;
    }

    // Merge fixed files
    for (const [file, content] of fixResult.fixedFiles) {
      currentFiles.set(file, content);
    }

    totalFixedCount += fixResult.fixedFiles.size;

    // Accumulate fixed error counts
    for (const [code, count] of Object.entries(fixResult.fixedErrorCounts)) {
      allFixedErrorCounts[code] = (allFixedErrorCounts[code] ?? 0) + count;
    }

    currentErrors = await compileErrors(files);
    if (currentErrors !== null) {
      fixer.verifyFixes(currentErrors);
    }
  }

  if (totalFixedCount === 0) {
    return null;
  }

  // Write fixed files back to disk
  for (const file of files) {
    const absolutePath = filePaths.get(file);
    if (absolutePath && currentFiles.has(file)) {
      const fixedContent = currentFiles.get(file);
      if (fixedContent) {
        writeFileSync(absolutePath, fixedContent, "utf-8");
      }
    }
  }

  return {
    fixedCount: totalFixedCount,
    fixedErrorCounts: allFixedErrorCounts,
  };
}
