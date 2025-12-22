import mo from "motoko";
import fs from "node:fs";
import { promisify } from "node:util";

// @ts-ignore
import base from "motoko/packages/latest/base.json";
mo.loadPackage(base);

// Enable M0236 warning
mo.setExtraFlags(["-W", "M0236"]);

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

interface Diagnostic {
  source: string;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string;
  severity: number;
}

interface Fix {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
  message: string;
}

export const fix = async (file: string, options: { dryRun?: boolean }) => {
  console.log(`Checking for fixes in ${file}...`);

  try {
    const content = await readFile(file, "utf8");
    mo.write(file, content);

    const diagnostics = mo.check(file) as any as Diagnostic[];

    if (!diagnostics || diagnostics.length === 0) {
      console.log("No fixes needed.");
      return;
    }

    const fixes: Fix[] = [];

    for (const diag of diagnostics) {
      // Fix M0236: Dot notation suggestion
      if (diag.code === "M0236") {
        const match = diag.message.match(
          /You can use the dot notation `(.+)\.(.+)\(\.\.\.\)` here/,
        );
        if (match) {
          const suggestedMethod = match[2];

          const originalText = extractText(content, diag.range);
          const parsed = parseCall(originalText);

          if (parsed && parsed.args.length > 0) {
            const receiver = parsed.args[0];
            const restArgs = parsed.args.slice(1).join(", ");
            const newText = `${receiver}.${suggestedMethod}(${restArgs})`;

            fixes.push({
              range: diag.range,
              newText: newText,
              message: diag.message,
            });
          }
        }
      }
    }

    if (fixes.length > 0) {
      console.log(`Found ${fixes.length} fix(es)`);

      if (options.dryRun) {
        for (const f of fixes) {
          console.log(
            `  Would replace '${extractText(content, f.range)}' at ${f.range.start.line + 1}:${f.range.start.character + 1} with: '${f.newText}'`,
          );
        }
      } else {
        const fixedContent = applyFixes(content, fixes);
        await writeFile(file, fixedContent);
        console.log(`Applied ${fixes.length} fix(es).`);
      }
    } else {
      console.log("No fixes applied.");
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
    throw err;
  }
};

function extractText(
  content: string,
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  },
): string {
  const lines = content.split("\n");
  const startLineNr = range.start.line;
  const endLineNr = range.end.line;
  const startChar = range.start.character;
  const endChar = range.end.character;
  const startLine = lines[startLineNr];
  if (startLine === undefined) {
    throw new Error(`Start line not found: ${startLineNr}`);
  }

  const endLine = lines[endLineNr];
  if (endLine === undefined) {
    throw new Error(`End line not found: ${endLineNr}`);
  }

  if (startLineNr === endLineNr) {
    return startLine.substring(startChar, endChar);
  }

  let text = startLine.substring(startChar);
  for (let i = startLineNr + 1; i < endLineNr; i++) {
    text += "\n" + lines[i];
  }
  text += "\n" + endLine.substring(0, endChar);
  return text;
}

function parseCall(code: string): { func: string; args: string[] } | null {
  // Matches Func(args) or Module.Func(args)
  const match = code.match(/^([\w.]+)\s*\(([\s\S]*)\)$/);
  if (!match) {
    return null;
  }

  const func = match[1] || "";
  const argsStr = match[2] || "";

  const args: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if (char === "(" || char === "[" || char === "{") {
      depth++;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth--;
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    args.push(current.trim());
  }

  // Handle empty args case "()"
  if (args.length === 1 && args[0] === "") {
    return { func, args: [] };
  }

  return { func, args };
}

function applyFixes(content: string, fixes: Fix[]): string {
  // Sort fixes in reverse order to avoid invalidating ranges
  const sortedFixes = [...fixes].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  let lines = content.split("\n");

  for (const fix of sortedFixes) {
    const startLine = fix.range.start.line;
    const endLine = fix.range.end.line;
    const startChar = fix.range.start.character;
    const endChar = fix.range.end.character;

    if (startLine === endLine) {
      const line = lines[startLine];
      if (line === undefined) {
        throw new Error(`Line ${startLine} not found`);
      }
      lines[startLine] =
        line.slice(0, startChar) + fix.newText + line.slice(endChar);
    } else {
      throw new Error("Multi-line replacement not supported");
    }
  }

  // Alternative: work on full string
  // Re-join lines for simplicity if we didn't modify in place above
  // But wait, the loop above modifies 'lines' array.
  // The 'else' block was empty.

  // Let's rewrite applyFixes to work on the full string for safety with multiline
  return applyFixesString(content, sortedFixes);
}

function applyFixesString(content: string, fixes: Fix[]): string {
  // Sort fixes in reverse order
  const sortedFixes = [...fixes].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  // We need to map (line, char) to absolute index
  const lines = content.split("\n");
  const lineOffsets: number[] = [];
  let currentOffset = 0;
  for (const line of lines) {
    lineOffsets.push(currentOffset);
    currentOffset += line.length + 1; // +1 for \n
  }

  let result = content;

  for (const fix of sortedFixes) {
    const startOffset =
      lineOffsets[fix.range.start.line]! + fix.range.start.character;
    const endOffset =
      lineOffsets[fix.range.end.line]! + fix.range.end.character;

    result =
      result.slice(0, startOffset) + fix.newText + result.slice(endOffset);
  }

  return result;
}
