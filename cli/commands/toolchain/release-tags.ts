import { SemVer } from "semver";

export type ReleaseInfo = {
  tag_name: string;
  published_at: string | null;
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

// Drafts are excluded unconditionally: GitHub never exposes them to anyone but
// the repo's own maintainers. Callers only choose whether prereleases show.
let filterReleases = (
  releases: ReleaseInfo[],
  {
    prerelease = false,
    exclude,
  }: { prerelease?: boolean; exclude?: string[] } = {},
): ReleaseInfo[] => {
  return releases.filter(
    (release) =>
      !release.draft &&
      (prerelease || !release.prerelease) &&
      !exclude?.includes(release.tag_name),
  );
};

/** Tags matching what `mops toolchain update` would resolve to, newest first. */
export let releaseTags = (
  releases: ReleaseInfo[],
  options?: { prerelease?: boolean; exclude?: string[] },
): string[] => {
  return sortReleaseTags(
    filterReleases(releases, options).map((release) => release.tag_name),
  ).reverse();
};

/** Tags in GitHub publish order, for display. */
export let releaseRows = (
  releases: ReleaseInfo[],
  options?: { prerelease?: boolean; exclude?: string[] },
): ReleaseInfo[] => {
  let kept = new Set(filterReleases(releases, options).map((r) => r.tag_name));
  return releases.filter((release) => kept.has(release.tag_name));
};
