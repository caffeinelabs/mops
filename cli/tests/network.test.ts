import { describe, expect, test } from "@jest/globals";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "path";
import { cli } from "./helpers";

// Isolated project per test: `.mops/network` is project state, and the global
// fallback is redirected via XDG_CONFIG_HOME, so nothing leaks between tests
// or into the developer's real config. The project lives outside the repo, so
// it is addressed via MOPS_CWD (the helper's `cwd` would break npm resolution).
function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mops-network-test-"));
  writeFileSync(path.join(dir, "mops.toml"), "[dependencies]\n");
  return dir;
}

function run(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
) {
  return cli(args, { env: { MOPS_CWD: cwd, ...extraEnv } });
}

describe("set-network / get-network", () => {
  test("defaults to ic", async () => {
    const cwd = makeProject();
    const result = await run(["get-network"], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ic");
  });

  test("set-network writes project-local .mops/network", async () => {
    const cwd = makeProject();
    const result = await run(["set-network", "local"], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Selected 'local' network/);
    expect(readFileSync(path.join(cwd, ".mops/network"), "utf8").trim()).toBe(
      "local",
    );

    const getResult = await run(["get-network"], cwd);
    expect(getResult.stdout.trim()).toBe("local");
  });

  test("MOPS_NETWORK env var overrides the saved network", async () => {
    const cwd = makeProject();
    await run(["set-network", "local"], cwd);
    const result = await run(["get-network"], cwd, {
      MOPS_NETWORK: "staging",
    });
    expect(result.stdout.trim()).toBe("staging");
  });

  test("set-network --global writes to the config dir; project-local wins", async () => {
    const cwd = makeProject();
    const configHome = mkdtempSync(path.join(tmpdir(), "mops-xdg-test-"));
    const env = { XDG_CONFIG_HOME: configHome };

    const result = await run(["set-network", "staging", "--global"], cwd, env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Selected 'staging' network \(global\)/);
    expect(
      readFileSync(path.join(configHome, "mops/network"), "utf8").trim(),
    ).toBe("staging");
    expect(existsSync(path.join(cwd, ".mops/network"))).toBe(false);

    // global applies when the project has no network set
    expect((await run(["get-network"], cwd, env)).stdout.trim()).toBe(
      "staging",
    );

    // project-local takes precedence over global
    await run(["set-network", "local"], cwd, env);
    expect((await run(["get-network"], cwd, env)).stdout.trim()).toBe("local");
  });

  test("set-network outside a project errors and suggests --global", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "mops-no-project-test-"));
    const result = await run(["set-network", "local"], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/--global/);
  });
});
