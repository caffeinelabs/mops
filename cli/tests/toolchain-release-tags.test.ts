import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import type { ReleaseInfo } from "../commands/toolchain/release-tags";

// Published newest-first, the order GitHub returns, with the non-version `dev`
// tag at the top — the case that let `latest` name a tag the picker filtered out.
let releases = (rows: [string, { prerelease?: boolean }][]): ReleaseInfo[] =>
  rows.map(([tag_name, flags]) => ({
    tag_name,
    published_at: "2024-06-01T00:00:00Z",
    prerelease: flags.prerelease ?? false,
    draft: false,
  }));

let wasmtimePage = releases([
  ["dev", { prerelease: true }],
  ["49.0.0-rc.1", { prerelease: true }],
  ["v48.0.2", {}],
  ["v48.0.1", {}],
]);
let page = wasmtimePage;

jest.unstable_mockModule("octokit", () => ({
  Octokit: class {
    request = async () => ({ status: 200, data: page });
  },
}));

let { getReleaseTags, getLatestReleaseTag, getReleases } =
  await import("../commands/toolchain/toolchain-utils.js");

// moc's shape once 2.0 ships: a 1.x bugfix is published after it.
describe("latest is the highest version", () => {
  beforeEach(() => {
    page = releases([
      ["1.16.2", {}],
      ["2.0.1", {}],
      ["2.1.0-beta.0", { prerelease: true }],
      ["2.0.0", {}],
      ["1.16.1", {}],
    ]);
  });
  afterEach(() => {
    page = wasmtimePage;
  });

  test("not the newest publish", async () => {
    expect(await getLatestReleaseTag("a/b")).toBe("2.0.1");
    expect(await getLatestReleaseTag("a/b", { prerelease: true })).toBe(
      "2.1.0-beta.0",
    );

    let res = await getReleaseTags("a/b");
    expect(res.latest).toBe("2.0.1");
    expect(res.tags).toEqual(["2.0.1", "2.0.0", "1.16.2", "1.16.1"]);

    let rows = await getReleases("a/b");
    expect(rows.map((r) => r.tag_name)).toEqual(res.tags);
  });
});

describe("getReleaseTags", () => {
  // `latest` is what `mops toolchain info` renders as `latest`, so a
  // tag dropped from `tags` must never survive there.
  test("latest is always a member of tags", async () => {
    for (let exclude of [undefined, ["dev"]]) {
      for (let options of [{}, { prerelease: true }, { all: true }]) {
        let res = await getReleaseTags("a/b", { ...options, exclude });
        if (res.latest !== undefined) {
          expect(res.tags).toContain(res.latest);
        }
      }
    }
  });

  test("an excluded tag is dropped from every field", async () => {
    let res = await getReleaseTags("a/b", { exclude: ["dev"] });

    expect(res.tags).not.toContain("dev");
    expect(res.latest).toBe("48.0.2");
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
