import { describe, expect, jest, test } from "@jest/globals";
import type { ReleaseInfo } from "../commands/toolchain/release-tags";

// Published newest-first, the order GitHub returns, with the non-version `dev`
// tag at the top — the case that let `latest` name a tag the picker filtered out.
let page: ReleaseInfo[] = [
  ["dev", { prerelease: true }],
  ["49.0.0-rc.1", { prerelease: true }],
  ["v48.0.2", {}],
  ["v48.0.1", {}],
].map(([tag_name, flags]: any) => ({
  tag_name,
  published_at: "2024-06-01T00:00:00Z",
  prerelease: flags.prerelease ?? false,
  draft: flags.draft ?? false,
}));

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    request = async () => ({ status: 200, data: page });
  },
}));

let { getReleaseTags, getLatestReleaseTag, getReleases } =
  await import("../commands/toolchain/toolchain-utils.js");

describe("getReleaseTags", () => {
  // `publishedLatest` is what `mops toolchain info` renders as `latest`, so a
  // tag dropped from `tags` must never survive there.
  test("publishedLatest is always a member of tags", async () => {
    for (let exclude of [undefined, ["dev"]]) {
      for (let options of [{}, { prerelease: true }, { all: true }]) {
        let res = await getReleaseTags("a/b", { ...options, exclude });
        if (res.publishedLatest !== undefined) {
          expect(res.tags).toContain(res.publishedLatest);
        }
      }
    }
  });

  test("an excluded tag is dropped from every field", async () => {
    let res = await getReleaseTags("a/b", { exclude: ["dev"] });

    expect(res.tags).not.toContain("dev");
    expect(res.publishedLatest).toBe("48.0.2");
  });

  // `wasmtime` publishes `dev`, which GitHub does not flag as a prerelease but
  // which is not a version. It reaches the shared fetcher as an exclusion.
  test("excluded tags stay out of the other fetch paths too", async () => {
    expect(await getLatestReleaseTag("a/b", { exclude: ["dev"] })).toBe(
      "48.0.2",
    );
    let rows = await getReleases("a/b", { exclude: ["dev"] });
    expect(rows.map((r) => r.tag_name)).not.toContain("dev");
  });

  test("without an exclusion, dev is still listed", async () => {
    let res = await getReleaseTags("a/b", { prerelease: true });

    expect(res.tags).toContain("dev");
  });
});
