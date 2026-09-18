import { describe, expect, test } from "@jest/globals";
import {
  releaseRows,
  releaseTags,
  sortReleaseTags,
  type ReleaseInfo,
} from "../commands/toolchain/release-tags";

let release = (
  tag_name: string,
  { prerelease = false, draft = false } = {},
): ReleaseInfo => ({
  tag_name,
  published_at: "2024-01-01T00:00:00Z",
  prerelease,
  draft,
});

describe("toolchain release tags", () => {
  test("sortReleaseTags orders semver ascending", () => {
    expect(sortReleaseTags(["1.2.0", "0.9.0", "1.10.0", "1.0.0"])).toEqual([
      "0.9.0",
      "1.0.0",
      "1.2.0",
      "1.10.0",
    ]);
  });

  test("releaseTags excludes drafts and prereleases, newest first", () => {
    let releases = [
      release("1.0.0"),
      release("1.2.0-beta", { prerelease: true }),
      release("1.1.0"),
      release("0.9.0", { draft: true }),
    ];

    expect(releaseTags(releases)).toEqual(["1.1.0", "1.0.0"]);
  });

  test("releaseTags keeps prereleases when asked, still excludes drafts", () => {
    let releases = [
      release("1.0.0"),
      release("1.2.0-beta", { prerelease: true }),
      release("1.1.0"),
      release("0.9.0", { draft: true }),
    ];

    expect(releaseTags(releases, { prerelease: true })).toEqual([
      "1.2.0-beta",
      "1.1.0",
      "1.0.0",
    ]);
  });

  test("releaseRows keeps GitHub publish order", () => {
    let releases = [
      release("2.0.0-beta.0", { prerelease: true }),
      release("1.16.1"),
      release("1.15.1-dedup-stable-types-3", { prerelease: true }),
      release("1.15.1"),
    ];

    expect(releaseRows(releases).map((r) => r.tag_name)).toEqual([
      "1.16.1",
      "1.15.1",
    ]);
    expect(
      releaseRows(releases, { prerelease: true }).map((r) => r.tag_name),
    ).toEqual([
      "2.0.0-beta.0",
      "1.16.1",
      "1.15.1-dedup-stable-types-3",
      "1.15.1",
    ]);
  });

  test("releaseRows drops drafts unconditionally", () => {
    let releases = [release("1.0.0"), release("2.0.0", { draft: true })];

    expect(
      releaseRows(releases, { prerelease: true }).map((r) => r.tag_name),
    ).toEqual(["1.0.0"]);
  });

  // `getReleaseTags` derives `publishedLatest` from `releaseRows`, and `latest`
  // falls back to it. A module that filters `tags` further must drop it too, or
  // `latest` can name a tag the same command filtered out.
  test("releaseTags and releaseRows agree on membership", () => {
    let releases = [
      release("49.0.0-rc.1", { prerelease: true }),
      release("48.0.2"),
      release("dev", { prerelease: true }),
      release("48.0.1"),
    ];

    for (let options of [undefined, { prerelease: true }]) {
      let tags = new Set(releaseTags(releases, options));
      expect(releaseRows(releases, options).map((r) => r.tag_name)).toEqual(
        releases.map((r) => r.tag_name).filter((tag) => tags.has(tag)),
      );
    }
  });
});
