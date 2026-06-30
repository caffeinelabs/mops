import { SemVer } from "semver";

// Subset of BenchOptions that drives moc flag selection. Kept separate from
// bench.ts so the flag logic is unit-testable without pulling in the replica /
// declarations graph.
export type BenchGcOptions = {
  gc: "copying" | "compacting" | "generational" | "incremental";
  forceGc: boolean;
  legacyPersistence: boolean;
  compilerVersion: string;
  profile: "Debug" | "Release";
};

// Collectors that only exist under legacy persistence. moc 0.15+ fixes the GC to
// incremental under enhanced orthogonal persistence and rejects these there.
export function isLegacyGc(gc: BenchGcOptions["gc"]): boolean {
  return gc === "copying" || gc === "compacting" || gc === "generational";
}

export function getMocArgs(options: BenchGcOptions): string {
  let args = "";

  let mocAtLeast015 =
    !!options.compilerVersion &&
    new SemVer(options.compilerVersion).compare("0.15.0") >= 0;

  // Selecting a legacy collector implies legacy persistence — it's the only mode
  // where moc accepts it. Below moc 0.15, legacy persistence is already the default
  // (and the flag doesn't exist), so we only emit --legacy-persistence on >= 0.15.
  let useLegacyPersistence = options.legacyPersistence || isLegacyGc(options.gc);

  if (useLegacyPersistence && mocAtLeast015) {
    args += " --legacy-persistence";
  }

  if (options.forceGc) {
    args += " --force-gc";
  }

  // Under EOP the GC is fixed (not choosable); only pass a collector flag where
  // it's selectable — legacy persistence (explicit or implied) or moc < 0.15.
  if (options.gc && (useLegacyPersistence || !mocAtLeast015)) {
    args += ` --${options.gc}-gc`;
  }

  if (options.profile === "Debug") {
    args += " --debug";
  } else if (options.profile === "Release") {
    args += " --release";
  }

  return args;
}
