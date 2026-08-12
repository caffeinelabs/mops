#!/usr/bin/env node
// Manual install-performance benchmark: released ic-mops v2 vs the v3 branch
// build, on a project depending on every caffeine registry package.
// See README.md for scenarios and usage. Hits the live IC registry.

import {execFileSync, spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchDir, "..", "..");

const {values: opts} = parseArgs({
  options: {
    iterations: {type: "string", default: "3"},
    scenarios: {type: "string", default: ""},
    targets: {type: "string", default: "v2,v3"},
    target: {type: "string", multiple: true, default: []},
    "v2-version": {type: "string", default: "2"},
    workdir: {type: "string", default: ""},
    out: {type: "string", default: ""},
    verbose: {type: "boolean", default: false},
    help: {type: "boolean", default: false},
  },
});

if (opts.help) {
  console.log(`Usage: node perf/install-bench/run.mjs [options]

Options:
  --iterations <n>    timed runs per scenario (default 3, median reported)
  --scenarios <a,b>   comma-separated scenario filter (substring match)
  --targets <a,b>     built-in targets to run: v2, v3 (default both)
  --target name=path  extra target: a mops CLI entry .js to run with node
                      (repeatable; e.g. a build from another worktree)
  --v2-version <v>    npm version/dist-tag for ic-mops v2 (default "2")
  --workdir <dir>     working directory (default: fresh dir in os.tmpdir())
  --out <file>        also write results as JSON
  --verbose           stream mops output through
  --help              this text

Scenarios: install-cold-nolock, install-cold-validlock, install-cold-stalelock,
install-warm-nolock, install-warm-validlock, install-warm-stalelock,
add-two, update-few, update-all`);
  process.exit(0);
}

const iterations = Math.max(1, parseInt(opts.iterations, 10) || 3);
const workdir = opts.workdir
  ? path.resolve(opts.workdir)
  : fs.mkdtempSync(path.join(os.tmpdir(), "mops-install-bench-"));
fs.mkdirSync(workdir, {recursive: true});

const fixtures = {
  full: fs.readFileSync(path.join(benchDir, "fixtures", "project.toml"), "utf8"),
  aged: fs.readFileSync(path.join(benchDir, "fixtures", "project-aged.toml"), "utf8"),
  stale: fs.readFileSync(path.join(benchDir, "fixtures", "project-stale.toml"), "utf8"),
};

// ---------------------------------------------------------------- targets

function makeTarget(name, cliJs) {
  const dir = path.join(workdir, `target-${name}`);
  const proj = path.join(dir, "project");
  fs.mkdirSync(proj, {recursive: true});
  return {
    name,
    cliJs,
    proj,
    cache: path.join(dir, "cache"),
    config: path.join(dir, "config"),
    locks: {},
  };
}

function setupV2() {
  const dir = path.join(workdir, "v2-npm");
  const pkgJson = path.join(dir, "package.json");
  fs.mkdirSync(dir, {recursive: true});
  if (!fs.existsSync(path.join(dir, "node_modules", "ic-mops"))) {
    fs.writeFileSync(pkgJson, JSON.stringify({name: "bench-v2", private: true}));
    console.log(`· installing ic-mops@${opts["v2-version"]} from npm ...`);
    execFileSync("npm", ["install", `ic-mops@${opts["v2-version"]}`, "--no-audit", "--no-fund"], {
      cwd: dir,
      stdio: opts.verbose ? "inherit" : "pipe",
    });
  }
  return makeTarget("v2", path.join(dir, "node_modules", "ic-mops", "dist", "cli.js"));
}

function setupV3() {
  const cliJs = path.join(repoRoot, "cli", "dist", "bin", "mops.js");
  if (!fs.existsSync(cliJs)) {
    console.log("· building v3 CLI (cli/dist missing) ...");
    execFileSync("npm", ["run", "prepare"], {
      cwd: path.join(repoRoot, "cli"),
      stdio: opts.verbose ? "inherit" : "pipe",
    });
  }
  return makeTarget("v3", cliJs);
}

const targets = [];
for (const t of opts.targets.split(",").map((s) => s.trim()).filter(Boolean)) {
  if (t === "v2") targets.push(setupV2());
  else if (t === "v3") targets.push(setupV3());
  else throw new Error(`unknown built-in target "${t}" (use --target name=path for custom ones)`);
}
for (const spec of opts.target) {
  const eq = spec.indexOf("=");
  if (eq < 1) throw new Error(`--target expects name=path, got "${spec}"`);
  const name = spec.slice(0, eq);
  const cliJs = path.resolve(spec.slice(eq + 1));
  if (!fs.existsSync(cliJs)) throw new Error(`target "${name}": ${cliJs} does not exist`);
  targets.push(makeTarget(name, cliJs));
}
if (targets.length === 0) throw new Error("no targets selected");

// ------------------------------------------------------------------ mops

function mops(target, args, {cwd = target.proj} = {}) {
  const t0 = performance.now();
  const res = spawnSync(process.execPath, [target.cliJs, ...args], {
    cwd,
    env: {
      ...process.env,
      XDG_CACHE_HOME: target.cache,
      XDG_CONFIG_HOME: target.config,
    },
    stdio: opts.verbose ? ["ignore", "inherit", "inherit"] : "pipe",
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  const ms = performance.now() - t0;
  if (res.status !== 0) {
    const out = opts.verbose ? "" : `\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`;
    throw new Error(`[${target.name}] mops ${args.join(" ")} exited ${res.status}${out}`);
  }
  return {ms, stdout: res.stdout ?? ""};
}

function rmrf(p) {
  fs.rmSync(p, {recursive: true, force: true});
}

function setState(target, {toml, lock = null, keepMops = false}) {
  fs.writeFileSync(path.join(target.proj, "mops.toml"), toml);
  if (!keepMops) rmrf(path.join(target.proj, ".mops"));
  const lockPath = path.join(target.proj, "mops.lock");
  rmrf(lockPath);
  if (lock !== null) fs.writeFileSync(lockPath, lock);
}

function readLock(target) {
  return fs.readFileSync(path.join(target.proj, "mops.lock"), "utf8");
}

function mopsCount(target) {
  try {
    return fs
      .readdirSync(path.join(target.proj, ".mops"))
      .filter((d) => !d.startsWith("_") && !d.startsWith(".")).length;
  } catch {
    return 0;
  }
}

// ----------------------------------------------------------------- setup
// One untimed pass per target: prime the cache with every version any
// scenario touches, and capture valid/stale lockfiles in this target's
// own lock format. Cold scenarios wipe the cache mid-run, so warm
// scenarios re-prime through side projects instead of trusting ordering.

function sideProject(target, name, toml) {
  const dir = path.join(path.dirname(target.proj), `prime-${name}`);
  fs.mkdirSync(dir, {recursive: true});
  if (toml !== undefined) fs.writeFileSync(path.join(dir, "mops.toml"), toml);
  return dir;
}

function prime(target) {
  console.log(`\n=== setup ${target.name}: priming cache and capturing lockfiles`);
  const version = mops(target, ["--version"]).stdout.trim().replace(/\s+/g, " ");
  target.version = version || "unknown";
  console.log(`· ${target.name} = ${target.version}`);

  setState(target, {toml: fixtures.full});
  mops(target, ["install", "--no-toolchain"]);
  target.locks.valid = readLock(target);
  console.log(`· full install ok (${mopsCount(target)} packages in .mops)`);

  setState(target, {toml: fixtures.stale});
  mops(target, ["install", "--no-toolchain"]);
  target.locks.stale = readLock(target);

  sideProject(target, "full", fixtures.full);
  sideProject(target, "stale", fixtures.stale);
  sideProject(target, "aged", fixtures.aged);

  // add-two priming: run the real `add` so the cache holds exactly the
  // versions the scenario will resolve
  const addProj = sideProject(
    target,
    "add",
    '[package]\nname = "prime-add"\nversion = "0.0.1"\n\n[dependencies]\ncore = "2.6.1"\n',
  );
  mops(target, ["install", "--no-toolchain"], {cwd: addProj});
  mops(target, ["add", "map"], {cwd: addProj});
  mops(target, ["add", "datetime"], {cwd: addProj});
}

// untimed warm-up: re-download anything a cold scenario evicted
function ensureWarm(target) {
  for (const name of ["full", "stale", "aged", "add"]) {
    mops(target, ["install", "--no-toolchain"], {cwd: sideProject(target, name)});
  }
}

// ------------------------------------------------------------- scenarios
// Each scenario: prepare() shapes cache + project state (untimed),
// run() is the timed part.

const scenarios = [
  {
    name: "install-cold-nolock",
    prepare(t) {
      rmrf(t.cache);
      setState(t, {toml: fixtures.full});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "install-cold-validlock",
    prepare(t) {
      rmrf(t.cache);
      setState(t, {toml: fixtures.full, lock: t.locks.valid});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "install-cold-stalelock",
    prepare(t) {
      rmrf(t.cache);
      setState(t, {toml: fixtures.full, lock: t.locks.stale});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "install-warm-nolock",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.full});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "install-warm-validlock",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.full, lock: t.locks.valid});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "install-warm-stalelock",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.full, lock: t.locks.stale});
    },
    run: (t) => mops(t, ["install", "--no-toolchain"]).ms,
  },
  {
    name: "add-two",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.full, lock: t.locks.valid});
      mops(t, ["install", "--no-toolchain"]);
    },
    run(t) {
      const a = mops(t, ["add", "map"]).ms;
      const b = mops(t, ["add", "datetime"]).ms;
      return a + b;
    },
  },
  {
    name: "update-few",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.aged});
      mops(t, ["install", "--no-toolchain"]);
    },
    run(t) {
      let ms = 0;
      for (const pkg of ["core", "google-oauth", "googlemail-client"]) {
        ms += mops(t, ["update", pkg]).ms;
      }
      return ms;
    },
  },
  {
    name: "update-all",
    prepare(t) {
      ensureWarm(t);
      setState(t, {toml: fixtures.aged});
      mops(t, ["install", "--no-toolchain"]);
    },
    run: (t) => mops(t, ["update"]).ms,
  },
];

const filter = opts.scenarios.split(",").map((s) => s.trim()).filter(Boolean);
const selected = filter.length
  ? scenarios.filter((s) => filter.some((f) => s.name.includes(f)))
  : scenarios;
if (selected.length === 0) throw new Error(`no scenarios match "${opts.scenarios}"`);

// -------------------------------------------------------------------- run

const fmt = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 1000).toFixed(2)}s`);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

console.log(`mops install benchmark — ${iterations} iteration(s), workdir ${workdir}`);
console.log(`targets: ${targets.map((t) => t.name).join(", ")}`);
console.log(`scenarios: ${selected.map((s) => s.name).join(", ")}`);

for (const target of targets) prime(target);

const results = [];
for (const scenario of selected) {
  for (const target of targets) {
    const times = [];
    for (let i = 0; i < iterations; i++) {
      process.stdout.write(`${scenario.name} [${target.name}] ${i + 1}/${iterations} ... `);
      scenario.prepare(target);
      try {
        const ms = scenario.run(target);
        times.push(ms);
        console.log(fmt(ms));
      } catch (e) {
        console.log("FAILED");
        console.error(String(e.message ?? e));
        times.length = 0;
        break;
      }
    }
    results.push({
      scenario: scenario.name,
      target: target.name,
      version: target.version,
      times,
      median: times.length ? median(times) : null,
      packages: mopsCount(target),
    });
  }
}

// ----------------------------------------------------------------- report

const names = targets.map((t) => t.name);
const base = names[0];
console.log(`\n## Results (median of ${iterations}, seconds)\n`);
const header = ["scenario", ...names, ...names.slice(1).map((n) => `${n} vs ${base}`)];
const rows = [header, header.map(() => "---")];
for (const scenario of selected) {
  const byTarget = Object.fromEntries(
    results.filter((r) => r.scenario === scenario.name).map((r) => [r.target, r]),
  );
  const row = [scenario.name];
  for (const n of names) {
    const r = byTarget[n];
    row.push(r?.median != null ? fmt(r.median) : "failed");
  }
  for (const n of names.slice(1)) {
    const a = byTarget[base]?.median;
    const b = byTarget[n]?.median;
    row.push(a && b ? `${(b / a).toFixed(2)}x` : "—");
  }
  rows.push(row);
}
console.log(rows.map((r) => `| ${r.join(" | ")} |`).join("\n"));
console.log(
  `\nversions: ${targets.map((t) => `${t.name} = ${t.version}`).join(", ")}` +
    `\nhost: ${os.platform()} ${os.arch()}, ${os.availableParallelism()} cpus, node ${process.version}`,
);

if (opts.out) {
  fs.writeFileSync(
    path.resolve(opts.out),
    JSON.stringify({date: new Date().toISOString(), iterations, results}, null, 2),
  );
  console.log(`\nraw results written to ${opts.out}`);
}
