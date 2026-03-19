import { PackageQuality } from "/declarations/main/main.did";

export let getQualityPoints = (quality: PackageQuality) => {
  let maxBasePoints = 6;

  let basePoints =
    Number(quality.hasDescription) +
    Number(quality.hasKeywords) +
    Number(quality.hasLicense) +
    Number(quality.hasRepository) +
    Number(!("tooOld" in quality.depsStatus)) +
    Number(quality.docsCoverage >= 50);

  let extraPoints =
    Number(quality.hasTests) +
    Number(quality.hasReleaseNotes) +
    Number("allLatest" in quality.depsStatus) +
    Number(quality.docsCoverage >= 90);

  if (basePoints !== maxBasePoints) {
    extraPoints = 0;
  }

  return {
    base: basePoints,
    extra: extraPoints,
    total: basePoints + extraPoints,
  };
};
