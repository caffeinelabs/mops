import { SemVer } from "semver";

export type ReleaseInfo = {
  tag_name: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
};

export let sortReleaseTags = (tags: string[]): string[] => {
  return [...tags].sort((a, b) => {
    try {
      return new SemVer(a).compare(new SemVer(b));
    } catch {
      return a.localeCompare(b);
    }
  });
};

export let stableReleaseTags = (releases: ReleaseInfo[]): string[] => {
  return sortReleaseTags(
    releases
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => release.tag_name),
  );
};
