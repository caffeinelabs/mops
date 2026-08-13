# Containerized run of the install benchmark, for constrained-environment
# checks (e.g. docker run --cpus 1 -m 512m). The v3 CLI must be built on the
# host first — cli/dist needs the Rust/wasm toolchain, which this image
# deliberately lacks:
#   cd cli && npm ci && npm run prepare
# Then build from the repo root:
#   docker build -f perf/install-bench/Dockerfile -t mops-install-bench .
FROM node:22-bookworm-slim

WORKDIR /repo
COPY cli/ cli/
COPY perf/install-bench/ perf/install-bench/

RUN test -f cli/dist/bin/mops.js || \
  { echo "cli/dist missing — build it on the host first: cd cli && npm run prepare"; exit 1; }
# runtime deps only; --ignore-scripts keeps npm from re-running the wasm build
RUN cd cli && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

ENTRYPOINT ["node", "perf/install-bench/run.mjs"]
