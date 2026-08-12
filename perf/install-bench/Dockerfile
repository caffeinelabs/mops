# Containerized run of the install benchmark, for constrained-environment
# checks (e.g. docker run --cpus 1 -m 512m). Build from the repo root:
#   docker build -f perf/install-bench/Dockerfile -t mops-install-bench .
FROM node:22-bookworm-slim

WORKDIR /repo
COPY cli/ cli/
COPY perf/install-bench/ perf/install-bench/

# npm ci runs the prepare lifecycle, which emits cli/dist (no bun needed)
RUN cd cli && npm ci --no-audit --no-fund

ENTRYPOINT ["node", "perf/install-bench/run.mjs"]
