import { describe, expect, test } from "@jest/globals";
import {
  latestCompatible,
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

  // Binaryen tags are not semver, and `version_99` must not outrank `version_131`.
  test("sortReleaseTags orders non-semver tags numerically", () => {
    expect(
      sortReleaseTags(["version_131", "version_99", "version_100"]),
    ).toEqual(["version_99", "version_100", "version_131"]);
  });

  // A moc 1.x bugfix published after 2.0 must not show up as the newest.
  test("releaseRows orders by version, not publish order", () => {
    let releases = [release("1.16.2"), release("2.0.0"), release("1.16.1")];

    expect(releaseRows(releases).map((r) => r.tag_name)).toEqual([
      "2.0.0",
      "1.16.2",
      "1.16.1",
    ]);
  });

  test("releaseRows filters prereleases", () => {
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
      "1.15.1",
      "1.15.1-dedup-stable-types-3",
    ]);
  });

  test("an unflagged semver prerelease is still a prerelease", () => {
    let releases = [release("2.2.3"), release("2.3.0-rc.1")];

    expect(releaseTags(releases)).toEqual(["2.2.3"]);
    expect(releaseTags(releases, { prerelease: true })).toEqual([
      "2.3.0-rc.1",
      "2.2.3",
    ]);
  });

  test("releaseRows drops drafts unconditionally", () => {
    let releases = [release("1.0.0"), release("2.0.0", { draft: true })];

    expect(
      releaseRows(releases, { prerelease: true }).map((r) => r.tag_name),
    ).toEqual(["1.0.0"]);
  });

  // The picker lists `releaseRows` and `latest` resolves from `releaseTags`, so
  // they must offer the same tags in the same order.
  test("releaseTags and releaseRows agree", () => {
    let releases = [
      release("49.0.0-rc.1", { prerelease: true }),
      release("48.0.2"),
      release("dev", { prerelease: true }),
      release("48.0.1"),
    ];

    for (let options of [undefined, { prerelease: true }]) {
      expect(releaseRows(releases, options).map((r) => r.tag_name)).toEqual(
        releaseTags(releases, options),
      );
    }
  });

  describe("latestCompatible", () => {
    let tags = ["2.2.2", "2.0.0", "1.16.2", "1.16.1", "0.14.1", "0.14.0"];

    // A project on moc 1.x gets the 1.x bugfix from `update`, not 2.x.
    test("stays on the pinned major", () => {
      expect(latestCompatible("1.16.1", tags)).toBe("1.16.2");
      expect(latestCompatible("2.0.0", tags)).toBe("2.2.2");
    });

    test("stays on the pinned minor for 0.x", () => {
      expect(latestCompatible("0.14.0", ["0.15.0", ...tags])).toBe("0.14.1");
    });

    test("never moves below the pin", () => {
      expect(latestCompatible("2.3.0-beta.1", tags)).toBeUndefined();
      expect(latestCompatible("1.17.0", tags)).toBeUndefined();
    });

    test("a pin that is not a version has no compatible range", () => {
      expect(latestCompatible("133", ["134", "133"])).toBeUndefined();
      expect(latestCompatible("./moc", tags)).toBeUndefined();
    });
  });
});
