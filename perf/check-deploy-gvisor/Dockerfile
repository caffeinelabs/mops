# Repro image for the PocketIC-under-gVisor memory blowup.
# Bakes everything at build time — mops, moc, the
# pocket-ic server binary, and the installed dependency set — so the run
# itself needs no network and measures only `mops build main --check-deploy`
# on the production mops.one registry canister (backend/main).
#
# Build from the repo root:
#   docker build -f perf/check-deploy-gvisor/Dockerfile -t mops-check-deploy-gvisor .
# Run via perf/check-deploy-gvisor/run.sh (compares --runtime=runc vs runsc).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl procps \
  && rm -rf /var/lib/apt/lists/*

# check-deploy landed in 2.21.0; its deployment path is unchanged through
# 2.23.0, so any contemporary 2.x release measures the same behavior.
ARG MOPS_VERSION=2.22.0
RUN npm i -g ic-mops@${MOPS_VERSION} && mops --version

# moc: fetched directly because mops 2.x only downloads x86_64 builds of
# dfinity releases; dfinity ships Linux aarch64 tarballs since 0.14.x. The
# fixture pins it as a [toolchain] binary path.
ARG MOC_VERSION=0.14.14
RUN mkdir /opt/moc && arch="$(uname -m)" \
  && curl -fsSL "https://github.com/dfinity/motoko/releases/download/${MOC_VERSION}/motoko-Linux-${arch}-${MOC_VERSION}.tar.gz" \
  | tar -xz -C /opt/moc \
  && /opt/moc/moc --version

# moc for the EOP/wasm64 variant project (fixtures/eop): a 1.x compiler with
# enhanced orthogonal persistence, fetched from the caffeinelabs fork, which
# publishes Linux builds for both architectures.
ARG MOC_EOP_VERSION=1.12.0
RUN mkdir /opt/moc-eop && arch="$(uname -m)" \
  && curl -fsSL "https://github.com/caffeinelabs/motoko/releases/download/${MOC_EOP_VERSION}/motoko-Linux-${arch}-${MOC_EOP_VERSION}.tar.gz" \
  | tar -xz -C /opt/moc-eop \
  && /opt/moc-eop/moc --version

# pocket-ic: fetched directly for the same reason (mops 2.x hardcodes
# x86_64-linux); the fixture pins it as a binary path, which check-deploy
# supports. 15.0.0 is the current PocketIC release.
ARG POCKET_IC_VERSION=15.0.0
RUN arch="$(uname -m)" && case "$arch" in aarch64) picarch=arm64 ;; *) picarch="$arch" ;; esac \
  && curl -fsSL "https://github.com/dfinity/pocketic/releases/download/${POCKET_IC_VERSION}/pocket-ic-${picarch}-linux.gz" \
  | gunzip > /opt/pocket-ic \
  && chmod +x /opt/pocket-ic \
  && /opt/pocket-ic --version

WORKDIR /project
COPY perf/check-deploy-gvisor/fixtures/ fixtures/
COPY backend/ backend/
RUN cp fixtures/mops.toml mops.toml && mops install \
  && (cd fixtures/eop && mops install)

COPY perf/check-deploy-gvisor/container-run.sh /usr/local/bin/container-run.sh
ENTRYPOINT ["/usr/local/bin/container-run.sh"]
