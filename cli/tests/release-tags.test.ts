import { describe, expect, test } from "@jest/globals";
import {
  sortReleaseTags,
  stableReleaseTags,
  type ReleaseInfo,
} from "../commands/toolchain/release-tags";

describe("toolchain-utils release tags", () => {
  test("sortReleaseTags orders semver ascending", () => {
    expect(sortReleaseTags(["1.2.0", "0.9.0", "1.10.0", "1.0.0"])).toEqual([
      "0.9.0",
      "1.0.0",
      "1.2.0",
      "1.10.0",
    ]);
  });

  test("stableReleaseTags excludes drafts and prereleases", () => {
    let releases: ReleaseInfo[] = [
      {
        tag_name: "1.1.0",
        published_at: "2024-01-03T00:00:00Z",
        prerelease: false,
        draft: false,
      },
      {
        tag_name: "1.2.0-beta",
        published_at: "2024-01-02T00:00:00Z",
        prerelease: true,
        draft: false,
      },
      {
        tag_name: "1.0.0",
        published_at: "2024-01-01T00:00:00Z",
        prerelease: false,
        draft: true,
      },
    ];

    expect(stableReleaseTags(releases)).toEqual(["1.1.0"]);
  });
});
