import { describe, expect, jest, test } from "@jest/globals";

// tree-sitter-motoko's shape: the grammar's `v*` releases and mo-fmt's
// `mo-fmt-v*` ones share a repo, and the grammar is published last.
let page = [
  ["v0.2.2", {}],
  ["mo-fmt-v0.2.0-beta.1", { prerelease: true }],
  ["mo-fmt-v0.1.1", {}],
  ["v0.2.1", {}],
  ["mo-fmt-v0.1.0", {}],
].map(([tag_name, flags]: any) => ({
  tag_name,
  published_at: "2026-09-25T00:00:00Z",
  prerelease: flags.prerelease ?? false,
  draft: false,
}));

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    request = async () => ({ status: 200, data: page });
  },
}));

let { getReleaseTags, getLatestReleaseTag, getReleases } =
  await import("../commands/toolchain/toolchain-utils.js");

const tagPrefix = "mo-fmt-v";

describe("tagPrefix", () => {
  test("latest skips the other release line", async () => {
    expect(await getLatestReleaseTag("a/b", { tagPrefix })).toBe("0.1.1");
    expect(
      await getLatestReleaseTag("a/b", { tagPrefix, prerelease: true }),
    ).toBe("0.2.0-beta.1");
  });

  test("every listing keeps only prefixed tags, prefix stripped", async () => {
    let res = await getReleaseTags("a/b", { tagPrefix });
    expect(res.tags).toEqual(["0.1.1", "0.1.0"]);
    expect(res.publishedLatest).toBe("0.1.1");

    let rows = await getReleases("a/b", { tagPrefix });
    expect(rows.map((r) => r.tag_name)).toEqual(["0.1.1", "0.1.0"]);
  });

  test("without a prefix, only a leading v is stripped", async () => {
    expect(await getLatestReleaseTag("a/b")).toBe("0.2.2");
    let res = await getReleaseTags("a/b");
    expect(res.tags).toContain("mo-fmt-v0.1.0");
  });
});
