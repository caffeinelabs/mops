import { describe, expect, jest, test } from "@jest/globals";
import type { ReleaseInfo } from "../commands/toolchain/release-tags";

// Published newest-first, the order GitHub returns, with the non-version `dev`
// tag at the top — the case that let `latest` name a tag the picker filtered out.
let releases = (
  rows: [string, { prerelease?: boolean; draft?: boolean }][],
): ReleaseInfo[] =>
  rows.map(([tag_name, flags]) => ({
    tag_name,
    published_at: "2024-06-01T00:00:00Z",
    prerelease: flags.prerelease ?? false,
    draft: flags.draft ?? false,
  }));

let page = releases([
  ["dev", { prerelease: true }],
  ["49.0.0-rc.1", { prerelease: true }],
  ["v48.0.2", {}],
  ["v48.0.1", {}],
]);

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    request = async () => ({ status: 200, data: page });
  },
}));

describe("toolchain module tag fixups", () => {
  test("every module derives publishedLatest from its own tags", async () => {
    let mods = await Promise.all([
      import("../commands/toolchain/wasmtime.js"),
      import("../commands/toolchain/wasm-opt.js"),
      import("../commands/toolchain/moc.js"),
      import("../commands/toolchain/lintoko.js"),
      import("../commands/toolchain/pocket-ic.js"),
    ]);

    for (let mod of mods) {
      for (let options of [{}, { prerelease: true }, { all: true }]) {
        let res = await mod.getReleaseTags(options);
        if (res.publishedLatest !== undefined) {
          expect(res.tags).toContain(res.publishedLatest);
        }
      }
    }
  });

  // `wasmtime` publishes `dev`, which GitHub does not flag as a prerelease but
  // which is not a version. It has to stay out of every path, including the
  // `latest` line that `info` renders from `publishedLatest`.
  test("wasmtime excludes the dev tag from every path", async () => {
    let wasmtime = await import("../commands/toolchain/wasmtime.js");

    for (let options of [{}, { prerelease: true }, { all: true }]) {
      let res = await wasmtime.getReleaseTags(options);
      expect(res.tags).not.toContain("dev");
      expect(res.publishedLatest).not.toBe("dev");
      expect(await wasmtime.getLatestReleaseTag(options)).not.toBe("dev");
      let rows = await wasmtime.getReleases(options);
      expect(rows.map((r) => r.tag_name)).not.toContain("dev");
    }

    expect((await wasmtime.getReleaseTags()).publishedLatest).toBe("48.0.2");
  });
});
