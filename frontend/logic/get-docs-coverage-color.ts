export function getDocsCoverageColor(docsCoverage: number, bright = false) {
  if (docsCoverage >= 90) {
    return bright
      ? "var(--color-quality-good-bright)"
      : "var(--color-quality-good)";
  } else if (docsCoverage >= 50) {
    return "var(--color-quality-medium)";
  } else {
    return "var(--color-quality-bad)";
  }
}
