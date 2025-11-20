FROM --platform=linux/amd64 zenvoich/mops-builder:1.1.0@sha256:9bb87e843a90f1c12ece4ba91ca703e19cd0d79522beb562f45b1f8a14cb05b6

# install Wasm build dependencies
RUN apk add --no-cache curl gcc musl-dev
RUN curl -sSf https://sh.rustup.rs/ | sh -s -- --default-toolchain=1.91.1 -y

# clone repository
ARG COMMIT_HASH
RUN git clone https://github.com/dfinity/mops.git

WORKDIR /mops
RUN git checkout $COMMIT_HASH

WORKDIR /mops/cli
RUN bun i --ignore-scripts

# build
ARG MOPS_VERSION
RUN npm version $MOPS_VERSION --allow-same-version
RUN . "$HOME/.cargo/env" && npm run build

# verify
ARG SHASUM
ENV SHASUM=$SHASUM
COPY verify.sh /verify.sh
RUN chmod +x /verify.sh
ENTRYPOINT ["sh", "/verify.sh"]