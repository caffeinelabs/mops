import { describe, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// `mops add` used to declare a package twice when `--dev` was passed for an
// existing dependency, `mops remove` only looked in the section `--dev`
// selected, an `org/repo` argument crashed with ERR_INVALID_URL, and
// `name@version` overwrote a pinned alias.
describe("add/remove ergonomics", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "add-remove-ergonomics"),
  );

  const toml = (cwd: string) =>
    readFileSync(path.join(cwd, "mops.toml"), "utf8");

  describe("add moves an entry between sections", () => {
    test("--dev moves a dependency to [dev-dependencies]", async () => {
      const cwd = await makeTempFixture("local-prod");

      const res = await cli(["add", "./packages/one", "--dev"], {
        cwd,
        env: { CI: "1" },
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(
        /Package moved one from \[dependencies\] to \[dev-dependencies\]/,
      );
      expect(toml(cwd)).toBe(
        '[dependencies]\n[dev-dependencies]\none = "./packages/one"\n',
      );
    });

    test("a plain add moves a dev dependency back", async () => {
      const cwd = await makeTempFixture("local-dev");

      const res = await cli(["add", "./packages/one"], {
        cwd,
        env: { CI: "1" },
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(
        /Package moved one from \[dev-dependencies\] to \[dependencies\]/,
      );
      expect(toml(cwd)).toBe(
        '[dev-dependencies]\n[dependencies]\none = "./packages/one"\n',
      );
    });
  });

  describe("remove searches both sections", () => {
    test("removes a dev-only dependency without --dev", async () => {
      const cwd = await makeTempFixture("local-dev");

      const res = await cli(["remove", "one"], { cwd, env: { CI: "1" } });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(
        /Package removed one = "\.\/packages\/one" from \[dev-dependencies\]/,
      );
      expect(toml(cwd)).toBe("[dev-dependencies]\n");
    });

    // Declared in both sections is a config error a hand-edited manifest can
    // still be in — the union interpretation drops both, like `npm uninstall`.
    test("removes both entries when declared twice", async () => {
      const cwd = await makeTempFixture("local-both");

      const res = await cli(["remove", "one"], { cwd, env: { CI: "1" } });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(/from \[dependencies\]/);
      expect(res.stdout).toMatch(/from \[dev-dependencies\]/);
      expect(toml(cwd)).toBe("[dependencies]\n[dev-dependencies]\n");
    });

    test("--dev removes only the dev entry when declared twice", async () => {
      const cwd = await makeTempFixture("local-both");

      const res = await cli(["remove", "one", "--dev"], {
        cwd,
        env: { CI: "1" },
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).not.toMatch(/from \[dependencies\]/);
      expect(toml(cwd)).toBe(
        '[dependencies]\none = "./packages/one"\n\n[dev-dependencies]\n',
      );
    });

    test("--dev still reports a prod-only dependency as missing", async () => {
      const cwd = await makeTempFixture("local-prod");

      const res = await cli(["remove", "one", "--dev"], {
        cwd,
        env: { CI: "1" },
      });

      expect(res.stdout).toMatch(/No dev dependency to remove "one"/);
      expect(toml(cwd)).toBe('[dependencies]\none = "./packages/one"\n');
    });
  });

  describe("add github source", () => {
    // Same repo the install-github-dep tests use, pinned by the resolved commit.
    test("resolves the org/repo shorthand", async () => {
      const cwd = await makeTempFixture("empty");

      const res = await cli(["add", "ZenVoich/test#main"], {
        cwd,
        env: { CI: "1" },
      });

      expect(res.exitCode).toBe(0);
      expect(toml(cwd)).toMatch(
        /^\[dependencies\]\ntest = "https:\/\/github\.com\/ZenVoich\/test#main@[0-9a-f]{40}"\n$/,
      );
    });

    // `packages/one` is a real directory here, and the shorthand makes it a
    // repo name, so the failure has to point at the `./` form.
    test("points at the local form when the shorthand is a local dir", async () => {
      const cwd = await makeTempFixture("local-prod");

      const res = await cli(["add", "packages/one"], { cwd, env: { CI: "1" } });

      expect(res.exitCode).toBe(1);
      expect(res.stdout).toMatch(
        /"packages\/one" exists locally — add a local package as \.\/packages\/one/,
      );
      expect(toml(cwd)).toBe('[dependencies]\none = "./packages/one"\n');
    });

    test.each([["a/b/c"], ["https://gitlab.com/foo/bar"], ["@scope/pkg"]])(
      "rejects %s with an actionable error",
      async (arg) => {
        const cwd = await makeTempFixture("empty");

        const res = await cli(["add", arg], { cwd, env: { CI: "1" } });

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toMatch(new RegExp(`Cannot add "${arg}"`));
        expect(res.stdout + res.stderr).not.toMatch(/ERR_INVALID_URL/);
        expect(toml(cwd)).toBe("[dependencies]\n");
      },
    );
  });

  describe("add with a version", () => {
    test("replaces the declared version and points at version pinning", async () => {
      const cwd = await makeTempFixture("pinned");

      const res = await cli(["add", "core@1.0.0"], { cwd, env: { CI: "1" } });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(
        /Note: replaced core = "2\.6\.1"\. Keep both versions by adding "core@2\.6\.1" = "2\.6\.1" to mops\.toml/,
      );
      expect(toml(cwd)).toBe('[dependencies]\ncore = "1.0.0"\n');
    });

    test("updates an existing pinned alias in place", async () => {
      const cwd = await makeTempFixture("pinned-alias");

      const res = await cli(["add", "core@1.0.0"], { cwd, env: { CI: "1" } });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toMatch(/Package installed core@1\.0\.0 = "1\.0\.0"/);
      expect(res.stdout).not.toMatch(/Note:/);
      // both versions survive, and the bare key keeps its own version
      expect(toml(cwd)).toBe(
        '[dependencies]\ncore = "2.6.1"\n"core@1.0.0" = "1.0.0"\n',
      );
    });
  });
});
