import { describe, expect, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cli, normalizePaths, useTempFixtures } from "./helpers";

describe("deployed", () => {
  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "deployed"),
  );

  describe("init", () => {
    test("creates baseline .most and sets [check-stable].path", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);

      const baseline = path.join(cwd, "deployed", "backend.most");
      expect(existsSync(baseline)).toBe(true);
      expect(readFileSync(baseline, "utf-8")).toBe(
        "// Version: 1.0.0\nactor { };\n",
      );

      const toml = readFileSync(path.join(cwd, "mops.toml"), "utf-8");
      expect(toml).toMatch(/\[canisters\.backend\.check-stable\]/);
      expect(toml).toMatch(/path\s*=\s*"deployed\/backend\.most"/);

      expect({
        exitCode: result.exitCode,
        stdout: normalizePaths(result.stdout),
        stderr: normalizePaths(result.stderr),
      }).toMatchSnapshot();
    });

    test("idempotent — second run is a no-op", async () => {
      const cwd = await makeTempFixture("basic");
      await cli(["deployed", "init"], { cwd });
      const tomlBefore = readFileSync(path.join(cwd, "mops.toml"), "utf-8");

      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);

      const tomlAfter = readFileSync(path.join(cwd, "mops.toml"), "utf-8");
      expect(tomlAfter).toBe(tomlBefore);
    });

    test("warns when [check-stable].path is set elsewhere", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(
        tomlPath,
        toml +
          '\n[canisters.backend.check-stable]\npath = "elsewhere/backend.most"\n',
      );

      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /check-stable\]\.path = "elsewhere\/backend\.most"/,
      );
      expect(result.stderr).toMatch(/does not match where `mops deployed`/);
      expect(existsSync(path.join(cwd, "deployed", "backend.most"))).toBe(true);

      // mops.toml should not have been rewritten
      expect(readFileSync(tomlPath, "utf-8")).toBe(
        toml +
          '\n[canisters.backend.check-stable]\npath = "elsewhere/backend.most"\n',
      );
    });

    test("respects [deployed].dir", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(tomlPath, `${toml}\n[deployed]\ndir = "snapshots"\n`);

      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, "snapshots", "backend.most"))).toBe(
        true,
      );
      expect(readFileSync(tomlPath, "utf-8")).toMatch(
        /path\s*=\s*"snapshots\/backend\.most"/,
      );
    });

    test("init for shorthand canister entry promotes it to a table", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      await writeFile(
        tomlPath,
        '[toolchain]\nmoc = "1.5.0"\n\n[canisters]\nbackend = "main.mo"\n',
      );

      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);

      const after = readFileSync(tomlPath, "utf-8");
      expect(after).toMatch(/\[canisters\.backend\]/);
      expect(after).toMatch(/main\s*=\s*"main\.mo"/);
      expect(after).toMatch(/\[canisters\.backend\.check-stable\]/);
      expect(after).toMatch(/path\s*=\s*"deployed\/backend\.most"/);
    });

    test("errors on unknown canister name", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["deployed", "init", "ghost"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/not found in mops\.toml/);
    });

    test("preserves an existing baseline file when wiring [check-stable].path", async () => {
      const cwd = await makeTempFixture("basic");
      const baseline = path.join(cwd, "deployed", "backend.most");
      const customMost =
        "// Version: 1.0.0\nactor {\n  stable var x : Nat\n};\n";
      // pre-create the baseline (e.g. real prod snapshot copied in by the user)
      await mkdir(path.join(cwd, "deployed"), { recursive: true });
      await writeFile(baseline, customMost);

      const result = await cli(["deployed", "init"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(readFileSync(baseline, "utf-8")).toBe(customMost);
      expect(readFileSync(path.join(cwd, "mops.toml"), "utf-8")).toMatch(
        /\[canisters\.backend\.check-stable\][\s\S]*path\s*=\s*"deployed\/backend\.most"/,
      );
    });
  });

  describe("post-deploy hook", () => {
    test("copies built .most into deployed/", async () => {
      const cwd = await makeTempFixture("basic");
      const buildResult = await cli(["build"], { cwd });
      expect(buildResult.exitCode).toBe(0);

      const result = await cli(["deployed"], { cwd });
      expect(result.exitCode).toBe(0);

      const built = path.join(cwd, ".mops", ".build", "backend.most");
      const promoted = path.join(cwd, "deployed", "backend.most");
      expect(existsSync(promoted)).toBe(true);
      expect(readFileSync(promoted, "utf-8")).toBe(
        readFileSync(built, "utf-8"),
      );
    });

    test("errors when source .most is missing", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["deployed", "backend"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/No built \.most/);
      expect(result.stderr).toMatch(/Run `mops build backend` first/);
    });

    test("warns when [check-stable].path differs from <dir>/<name>.most", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(
        tomlPath,
        toml +
          '\n[canisters.backend.check-stable]\npath = "elsewhere/backend.most"\n',
      );

      const buildResult = await cli(["build"], { cwd });
      expect(buildResult.exitCode).toBe(0);

      const result = await cli(["deployed"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /check-stable\]\.path = "elsewhere\/backend\.most"/,
      );
      expect(result.stderr).toMatch(/won't see updates from `mops deployed`/);
    });

    test("respects [deployed].dir from config", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(tomlPath, `${toml}\n[deployed]\ndir = "snapshots"\n`);

      await cli(["build"], { cwd });
      const result = await cli(["deployed"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, "snapshots", "backend.most"))).toBe(
        true,
      );
      expect(existsSync(path.join(cwd, "deployed", "backend.most"))).toBe(
        false,
      );
    });

    test("--build-dir and --dir overrides", async () => {
      const cwd = await makeTempFixture("basic");
      const customOut = "custom-build";
      const customDir = "snapshots";

      const buildResult = await cli(
        ["build", "backend", "--output", customOut],
        { cwd },
      );
      expect(buildResult.exitCode).toBe(0);

      const result = await cli(
        ["deployed", "--build-dir", customOut, "--dir", customDir],
        { cwd },
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, customDir, "backend.most"))).toBe(true);
    });

    test("with no canister names promotes all canisters", async () => {
      const cwd = await makeTempFixture("multi");
      const buildResult = await cli(["build"], { cwd });
      expect(buildResult.exitCode).toBe(0);

      const result = await cli(["deployed"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, "deployed", "foo.most"))).toBe(true);
      expect(existsSync(path.join(cwd, "deployed", "bar.most"))).toBe(true);
    });

    test("named canister filters to that canister only", async () => {
      const cwd = await makeTempFixture("multi");
      await cli(["build"], { cwd });

      const result = await cli(["deployed", "foo"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, "deployed", "foo.most"))).toBe(true);
      expect(existsSync(path.join(cwd, "deployed", "bar.most"))).toBe(false);
    });
  });

  describe("end-to-end with check-stable", () => {
    test("init + build + deployed wires the check-stable baseline", async () => {
      const cwd = await makeTempFixture("basic");

      await cli(["deployed", "init"], { cwd });
      await cli(["build"], { cwd });
      const promoteResult = await cli(["deployed"], { cwd });
      expect(promoteResult.exitCode).toBe(0);

      const checkResult = await cli(["check-stable"], { cwd });
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stdout).toMatch(/Stable compatibility check passed/);
    });
  });
});
