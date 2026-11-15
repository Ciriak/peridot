FROM node:24.15-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app

FROM base AS builder

ARG PERIDOT_BUILD_CHANNEL=local
ARG PERIDOT_BUILD_TAG=
ARG PERIDOT_BUILD_COMMIT=
ARG PERIDOT_VERSION=

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @peridot/contracts build \
  && pnpm --filter @peridot/server build \
  && pnpm --filter @peridot/web generate

FROM base AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /music \
  && chown node:node /data

ARG PERIDOT_BUILD_CHANNEL=local
ARG PERIDOT_BUILD_TAG=
ARG PERIDOT_BUILD_COMMIT=
ARG PERIDOT_VERSION=

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=17430 \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=17431 \
    PERIDOT_SERVE_WEB=true \
    PERIDOT_WEB_DIST=/app/apps/web/.output/public \
    PERIDOT_WATCHTOWER_URL=http://watchtower:8080 \
    PERIDOT_WATCHTOWER_TOKEN_FILE=/data/watchtower-token \
    PERIDOT_UPDATE_CHANNEL=${PERIDOT_BUILD_CHANNEL} \
    PERIDOT_BUILD_TAG=${PERIDOT_BUILD_TAG} \
    PERIDOT_BUILD_COMMIT=${PERIDOT_BUILD_COMMIT} \
    DATABASE_URL=file:/data/peridot.db \
    MUSIC_LIBRARY_PATH=/music

LABEL org.opencontainers.image.title="Peridot" \
      org.opencontainers.image.description="Self-hosted music platform" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${PERIDOT_VERSION}" \
      org.opencontainers.image.revision="${PERIDOT_BUILD_COMMIT}" \
      org.opencontainers.image.ref.name="${PERIDOT_BUILD_TAG}" \
      com.centurylinklabs.watchtower.enable="true"

COPY --from=builder --chown=node:node /app /app
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/peridot-entrypoint

USER node
EXPOSE 17430 17431

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:17431/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/peridot-entrypoint"]
