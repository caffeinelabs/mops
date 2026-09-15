import process from "node:process";

// Split out of the tool modules so tests can call it directly: `moc.ts` and
// `lintoko.ts` reach `mops.js` for the cache dir.
//
// Named for what mops resolved, not for the hardware: an x64 Node.js running
// under Rosetta on Apple Silicon reports `x64` here too, and telling that user
// their Mac is Intel would be false.
//
// Parameterized rather than reading the globals inside: no CI runner is macOS,
// so injection is the only way this branch is exercised at all.
export let resolvesToX64Darwin = (
  platform = process.platform,
  arch = process.arch,
): boolean => platform === "darwin" && !arch.startsWith("arm");

// A 404 on a darwin-x86_64 asset is the only symptom Intel-Mac users get, and
// `ERROR 404 <url>` names neither the platform nor a way out. Returns undefined
// on every other platform, so the caller keeps the generic message.
//
// A 404 also covers a version that was never published, so this says the asset
// is missing and offers the dropped Intel-Mac build as the likely cause rather
// than asserting it. Everything that differs between tools — why it is gone and
// what to pin instead — comes from the caller.
export let x64DarwinMissingBuildHint = ({
  tool,
  version,
  url,
  reason,
  alternative,
}: {
  tool: string;
  version: string;
  url: string;
  /** One sentence on why this platform has no asset. */
  reason: string;
  /** What to pin instead — one imperative sentence, tool-specific. */
  alternative: string;
}): string | undefined => {
  if (!resolvesToX64Darwin()) {
    return undefined;
  }
  return (
    `Error: ${tool} ${version} has no Intel-Mac build. ` +
    `mops resolved this process as x86_64-darwin and asked for ${url}, which is not published.\n` +
    `${reason}\n` +
    `${alternative}\n` +
    `If this Mac is Apple Silicon, run mops under an arm64 Node.js so it resolves the arm64 build instead.`
  );
};
