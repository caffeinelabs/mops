import { describe, test, expect } from "@jest/globals";
import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// `@dfinity/pic` is a devDependency pre-bundled into `dist/vendor/pic.mjs` by the
// `vendor:pic` build step. esbuild silently emits zero named exports when a CJS
// module is re-exported with `export *`, and that only blows up when the CLI
// actually starts a replica — so the bundle's exports need a direct check.
const distDir = path.join(import.meta.dirname, "..", "dist");
const bundlePath = path.join(distDir, "vendor", "pic.mjs");
const clientPath = path.join(distDir, "helpers", "pocket-ic-client.js");

// Depends on `npm run build` (its `prepare` step) having produced `dist/`.
const isBuilt = existsSync(bundlePath);
if (!isBuilt) {
  console.warn(
    `Skipping vendored pic bundle tests: ${bundlePath} not found. Run \`npm run build\` in cli/ first.`,
  );
}
const describeBuilt = isBuilt ? describe : describe.skip;

// Loaded in a real `node` process rather than through Jest's ESM shim, so this
// matches how the shipped CLI imports the bundle.
const probe = [
  `const mod = await import(${JSON.stringify(pathToFileURL(bundlePath).href)});`,
  `process.stdout.write(JSON.stringify({`,
  `exports: Object.keys(mod).sort(),`,
  `serverStart: typeof mod.PocketIcServer?.start,`,
  `clientCreate: typeof mod.PocketIc?.create,`,
  `}));`,
].join("\n");

describeBuilt("vendored @dfinity/pic bundle", () => {
  test("exposes named exports that work at runtime", async () => {
    const result = await execa("node", ["--input-type=module", "-e", probe], {
      reject: false,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `node failed to import ${bundlePath} (exit ${result.exitCode}):\n${result.stderr}`,
      );
    }

    const probed = JSON.parse(result.stdout);
    expect(probed.exports).toEqual(["PocketIc", "PocketIcServer"]);
    expect(probed.serverStart).toBe("function");
    expect(probed.clientCreate).toBe("function");
  });

  test("dist client imports the vendored bundle instead of the devDependency", () => {
    const client = readFileSync(clientPath, "utf8");
    expect(client).toContain('import("../vendor/pic.mjs")');
    expect(client).not.toContain('import("@dfinity/pic")');
  });

  // `@icp-sdk/core` is a real dependency of mops on the same major pic wants, so
  // the bundle must resolve it at runtime rather than inline a second copy
  // (~550 KB, and two structurally-identical-but-unrelated sets of IDL types).
  test("leaves @icp-sdk/core external", () => {
    const bundle = readFileSync(bundlePath, "utf8");
    expect(bundle).toMatch(/__require\("@icp-sdk\/core\/principal"\)/);
    // The inlined copy brings its own crypto stack along with it.
    expect(bundle).not.toContain("node_modules/@icp-sdk/core/");
  });
});
