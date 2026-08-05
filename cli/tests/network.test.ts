import { describe, expect, test } from "@jest/globals";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "path";
import { cli } from "./helpers";

// Every case runs in a throwaway project with XDG_CONFIG_HOME (global network)
// and XDG_CACHE_HOME (package cache) redirected, so nothing leaks between tests
// or into the developer's real config. The project lives outside the repo, so
// it is addressed via MOPS_CWD (the helper's `cwd` would break npm resolution).
function makeProject(): { cwd: string; env: Record<string, string> } {
  const cwd = mkdtempSync(path.join(tmpdir(), "mops-network-test-"));
  writeFileSync(path.join(cwd, "mops.toml"), "[dependencies]\n");
  return {
    cwd,
    env: {
      XDG_CONFIG_HOME: mkdtempSync(path.join(tmpdir(), "mops-xdg-config-")),
      XDG_CACHE_HOME: mkdtempSync(path.join(tmpdir(), "mops-xdg-cache-")),
    },
  };
}

function run(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): ReturnType<typeof cli> {
  return cli(args, { env: { MOPS_CWD: cwd, ...env } });
}

describe("set-network / get-network", () => {
  test("defaults to ic", async () => {
    const { cwd, env } = makeProject();
    const result = await run(["get-network"], cwd, env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ic");
  });

  test("set-network writes project-local .mops/network", async () => {
    const { cwd, env } = makeProject();
    const result = await run(["set-network", "local"], cwd, env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Selected 'local' network/);
    expect(readFileSync(path.join(cwd, ".mops/network"), "utf8").trim()).toBe(
      "local",
    );

    const getResult = await run(["get-network"], cwd, env);
    expect(getResult.stdout.trim()).toBe("local");
  });

  test("MOPS_NETWORK env var overrides the saved network", async () => {
    const { cwd, env } = makeProject();
    await run(["set-network", "local"], cwd, env);
    const result = await run(["get-network"], cwd, {
      ...env,
      MOPS_NETWORK: "staging",
    });
    expect(result.stdout.trim()).toBe("staging");
  });

  test("set-network --global writes to the config dir; project-local wins", async () => {
    const { cwd, env } = makeProject();

    const result = await run(["set-network", "staging", "--global"], cwd, env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Selected 'staging' network \(global\)/);
    expect(
      readFileSync(
        path.join(env["XDG_CONFIG_HOME"] as string, "mops/network"),
        "utf8",
      ).trim(),
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
    const { cwd, env } = makeProject();
    const noProject = mkdtempSync(path.join(tmpdir(), "mops-no-project-test-"));
    const result = await run(["set-network", "local"], noProject, env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/--global/);
    expect(existsSync(path.join(cwd, ".mops/network"))).toBe(false);
  });

  // The network setting lives in `.mops/`, which `mops cache clean` empties.
  // Losing it would silently switch the project back to `ic`.
  test("mops cache clean keeps the project network but drops cached packages", async () => {
    const { cwd, env } = makeProject();
    await run(["set-network", "local"], cwd, env);
    writeFileSync(path.join(cwd, ".mops/some-pkg@1.0.0"), "cached\n");

    const result = await run(["cache", "clean"], cwd, env);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(cwd, ".mops/some-pkg@1.0.0"))).toBe(false);
    expect((await run(["get-network"], cwd, env)).stdout.trim()).toBe("local");
  });
});
