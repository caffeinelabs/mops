import { describe, expect, jest, test } from "@jest/globals";

// Binaryen's first page mixes `version_N` releases with old Emscripten-era
// `1.38.x` tags, which parse as semver and mops cannot install.
let page = [
  "version_133",
  "version_99",
  "1.39.1",
  "version_132",
  "1.38.48",
].map((tag_name) => ({
  tag_name,
  published_at: "2026-11-01T00:00:00Z",
  prerelease: false,
  draft: false,
}));

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    request = async () => ({ status: 200, data: page });
  },
}));

let wasmOpt = await import("../commands/toolchain/wasm-opt.js");

describe("wasm-opt release tags", () => {
  test("latest is the highest version_N, not a legacy semver tag", async () => {
    expect(await wasmOpt.getLatestReleaseTag()).toBe("133");

    let res = await wasmOpt.getReleaseTags();
    expect(res.latest).toBe("133");
    expect(res.tags).toEqual(["133", "132", "99"]);

    let rows = await wasmOpt.getReleases();
    expect(rows.map((r) => r.tag_name)).toEqual(["133", "132", "99"]);
  });
});
