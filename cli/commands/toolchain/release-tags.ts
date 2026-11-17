import { SemVer } from "semver";

export type ReleaseInfo = {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
};

/** Which releases to list. `exclude` drops tags GitHub does not flag. */
export type ReleaseFilter = {
  prerelease?: boolean;
  exclude?: string[];
};

let parseSemVer = (tag: string): SemVer | undefined => {
  try {
    return new SemVer(tag);
  } catch {
    return undefined;
  }
};

// Any version outranks a non-version tag, so a stray tag such as `dev` can
// never become `latest`. Non-version tags compare numerically, so Binaryen's
// `version_99` sorts below `version_131`.
export let sortReleaseTags = (tags: string[]): string[] => {
  return [...tags].sort((a, b) => {
    let va = parseSemVer(a);
    let vb = parseSemVer(b);
    if (va && vb) {
      return va.compare(vb);
    }
    if (va || vb) {
      return va ? 1 : -1;
    }
    return a.localeCompare(b, "en", { numeric: true });
  });
};

// A semver prerelease such as `2.3.0-rc.1` counts even when GitHub does not
// flag it, or it would outrank the stable `2.2.x` line as `latest`.
let isPrerelease = (release: ReleaseInfo): boolean =>
  release.prerelease ||
  (parseSemVer(release.tag_name)?.prerelease.length ?? 0) > 0;

// Drafts are excluded unconditionally: GitHub never exposes them to anyone but
// the repo's own maintainers. Callers only choose whether prereleases show.
let filterReleases = (
  releases: ReleaseInfo[],
  { prerelease = false, exclude }: ReleaseFilter = {},
): ReleaseInfo[] => {
  return releases.filter(
    (release) =>
      !release.draft &&
      (prerelease || !isPrerelease(release)) &&
      !exclude?.includes(release.tag_name),
  );
};

/** Tags matching what `mops toolchain update` would resolve to, highest first. */
export let releaseTags = (
  releases: ReleaseInfo[],
  options?: ReleaseFilter,
): string[] => {
  return sortReleaseTags(
    filterReleases(releases, options).map((release) => release.tag_name),
  ).reverse();
};

/** Rows in `releaseTags` order, for display with their dates. */
export let releaseRows = (
  releases: ReleaseInfo[],
  options?: ReleaseFilter,
): ReleaseInfo[] => {
  let kept = filterReleases(releases, options);
  let byTag = new Map(kept.map((release) => [release.tag_name, release]));
  return releaseTags(kept, options).map((tag) => byTag.get(tag)!);
};
