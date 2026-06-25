/** Enhanced-migration names recorded in a Version 4.0.0 `.most` chain block. */
export function parseMostAppliedMigrationNames(
  content: string,
): string[] | null {
  const version = content.match(/^\/\/ Version: ([^\n]+)/m)?.[1]?.trim();
  if (!version) {
    return null;
  }
  if (version !== "4.0.0") {
    return [];
  }
  const actorIdx = content.search(/\nactor\b/);
  if (actorIdx < 0) {
    return null;
  }
  const chainBlock = content.slice(0, actorIdx);
  const names: string[] = [];
  for (const match of chainBlock.matchAll(/"([^"]+)"\s*:/g)) {
    names.push(match[1]!);
  }
  return names;
}

export function migrationBasename(file: string): string {
  return file.endsWith(".mo") ? file.slice(0, -3) : file;
}

/** Lexicographic max of applied migration names (matches chain file sort order). */
export function latestAppliedMigrationName(appliedNames: string[]): string {
  return appliedNames.reduce((max, name) => (name > max ? name : max), "");
}
