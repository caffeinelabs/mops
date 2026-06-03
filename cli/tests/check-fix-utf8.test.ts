import { describe, expect, test, beforeAll } from "@jest/globals";
import { cpSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "path";
import { cli, normalizePaths } from "./helpers";

// Regression: --fix must apply byte-accurately on UTF-8 source. The fixture
// pins a moc version that emits `byte_start`/`byte_end` so the byte path is
// exercised; without those fields the fixer over-deletes on multi-byte lines
// (e.g. `Char.toNat32('京')` losing its trailing `)`).
describe("check --fix (utf-8 source)", () => {
  const fixDir = path.join(import.meta.dirname, "check/fix-utf8");
  const runDir = path.join(fixDir, "run");
  const warningFlags = "-W=M0236";

  beforeAll(() => {
    for (const file of readdirSync(runDir).filter((f) => f.endsWith(".mo"))) {
      unlinkSync(path.join(runDir, file));
    }
  });

  test("multi-byte characters do not corrupt the fix", async () => {
    const src = "multibyte.mo";
    const runFilePath = path.join(runDir, src);
    cpSync(path.join(fixDir, src), runFilePath);

    const fixResult = await cli(
      ["check", runFilePath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );

    expect(normalizePaths(fixResult.stdout)).toMatchSnapshot("fix output");
    const fixedContent = readFileSync(runFilePath, "utf-8");
    expect(fixedContent).toMatchSnapshot("fixed file");

    // Concrete byte-accuracy assertions: every Char.toNat32 call must be
    // rewritten to dot notation, with the literal intact and the trailing
    // `)` preserved (the original regression: 京/💩 used to drop it).
    expect(fixedContent).toContain("ignore 'A'.toNat32();");
    expect(fixedContent).toContain("ignore '京'.toNat32();");
    expect(fixedContent).toContain("ignore '💩'.toNat32();");
    expect(fixedContent).not.toMatch(/ignore Char\.toNat32/);

    // Verify no remaining M0236 warnings.
    const afterResult = await cli(
      ["check", runFilePath, "--", warningFlags, "--error-format=json"],
      { cwd: fixDir },
    );
    expect(afterResult.stdout).not.toContain('"code":"M0236"');
  });
});
