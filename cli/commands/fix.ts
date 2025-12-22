import mo from "motoko";
import fs from "node:fs";
import { promisify } from "node:util";

// @ts-ignore
import base from "motoko/packages/latest/base.json";
mo.loadPackage(base);

// Enable all warning codes we can fix
mo.setExtraFlags(["-W", "M0223,M0235,M0236,M0237"]);

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
      // Fix M0223: Redundant type instantiation
      // Remove type arguments like <Nat> from inferred<Nat>(1) -> inferred(1)
      // The range always covers the whole type instantiation, so we can just remove it
      if (diag.code === "M0223") {
        fixes.push({
          range: diag.range,
          newText: "", // Remove the type instantiation entirely
          message: diag.message,
        });
      }

      // Fix M0235: Deprecation warning
      // Note: Deprecation warnings can't be automatically fixed, but we skip them
      // as they require manual code changes. The test may need adjustment.
      if (diag.code === "M0235") {
        // Skip - deprecation warnings require manual intervention
        continue;
      }

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

      // Fix M0237: Redundant explicit implicit arguments
      // Remove explicit implicit arguments like Nat.compare from get(Nat.compare, 1) -> get(1)
      // The range covers the argument, and we optionally remove whitespace + comma after it
      if (diag.code === "M0237") {
        const lines = content.split("\n");
        const lineIdx = diag.range.end.line;
        const line = lines[lineIdx];

        if (line) {
          const restOfLine = line.substring(diag.range.end.character);
          const nextLine = lines[lineIdx + 1];
          const textToCheck =
            nextLine !== undefined ? restOfLine + "\n" + nextLine : restOfLine;

          const match = textToCheck.match(/^\s*,\s*/);

          if (match) {
            const fullMatch = match[0];

            let endLine = lineIdx;
            let endChar = diag.range.end.character;

            const nlIndex = fullMatch.lastIndexOf("\n");
            if (nlIndex !== -1) {
              endLine++;
              endChar = fullMatch.length - (nlIndex + 1);
            } else {
              endChar += fullMatch.length;
            }

            fixes.push({
              range: {
                start: diag.range.start,
                end: { line: endLine, character: endChar },
              },
              newText: "",
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
  return applyFixesString(content, fixes);
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
