/** Binaryen tags are `version_131`; mops pins `131`. */
export let normalizeBinaryenVersion = (tag: string): string => {
  if (tag.startsWith("version_")) {
    return tag.slice("version_".length);
  }
  // Generic toolchain helpers strip a leading `v`, turning `version_131` into `ersion_131`.
  if (tag.startsWith("ersion_")) {
    return tag.slice("ersion_".length);
  }
  return tag.replace(/^v/, "");
};
