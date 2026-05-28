# syntax=docker/dockerfile:1.7
# Base image: node 20 LTS slim, sha256-pinned for reproducible build.
# NOTE: the digest below is a placeholder — replace before first real build:
#   docker pull node:20-bookworm-slim
#   docker inspect --format='{{index .RepoDigests 0}}' node:20-bookworm-slim
FROM node:20-bookworm-slim@sha256:0e0c8e7e4f1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e AS base

# --- args / build-time pins ---
ARG DWS_VERSION=1.0.32
ARG DWS_DOWNLOAD_BASE=https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download
# Override these at build time (--build-arg) if pulling from a private mirror.

# --- system deps ---
# - ca-certificates: HTTPS to mcp-gw.dingtalk.com
# - curl: tarball download
# - tini: PID 1 for graceful SIGTERM (lark-mcp pattern)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tini \
  && rm -rf /var/lib/apt/lists/*

# --- install dws ---
# AgentCore Runtime is linux/amd64; multi-arch handled in Plan 3 if needed.
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) dwsArch="linux-amd64" ;; \
      aarch64) dwsArch="linux-arm64" ;; \
      *) echo "unsupported arch $arch" >&2; exit 1 ;; \
    esac; \
    url="${DWS_DOWNLOAD_BASE}/v${DWS_VERSION}/dws-${dwsArch}.tar.gz"; \
    echo "Downloading dws from $url"; \
    curl -fsSL "$url" -o /tmp/dws.tar.gz; \
    tar -xzf /tmp/dws.tar.gz -C /usr/local/bin/ dws; \
    chmod +x /usr/local/bin/dws; \
    rm /tmp/dws.tar.gz; \
    /usr/local/bin/dws --version

# --- app dir ---
WORKDIR /app

# Copy package manifests first for layer caching.
COPY docker/package.json ./package.json

# Build context is packages/remote/ (set by RuntimeStack DockerImageAsset).
# Copy shared/ package next to docker/ contents so server.js can import it.
COPY shared/catalog.json ./shared/catalog.json
COPY shared/tier1.json ./shared/tier1.json
COPY shared/scope-map.json ./shared/scope-map.json
COPY shared/src ./shared/src

# Copy server + inject-token. server.js resolves shared via ./shared/src/index.mjs.
COPY docker/server.js ./server.js
COPY docker/inject-token.mjs ./inject-token.mjs

# --- runtime user ---
# node:20-bookworm-slim ships a `node` user (uid 1000). Use it.
RUN mkdir -p /var/dws/users && chown -R node:node /var/dws /app

USER node

# --- env ---
# Per spec §6.1
ENV DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp
ENV DWS_DISABLE_KEYCHAIN=1
ENV DWS_CONFIG_DIR_BASE=/var/dws/users
ENV NODE_ENV=production
ENV PORT=8000
# Default token-injection strategy. Switch to d1 / d3 once PoC validates.
ENV INJECT_STRATEGY=d2
# Concurrency cap (lark-mcp uses 10).
ENV MAX_CONCURRENT=10

EXPOSE 8000

# Tini → node ensures SIGTERM reaches the process for graceful drain.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.js"]
