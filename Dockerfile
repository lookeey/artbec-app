FROM node:24-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV WRANGLER_SEND_METRICS=false CLOUDFLARE_CF_FETCH_ENABLED=false
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --include=optional --no-audit --no-fund
COPY . .
RUN node docker/prepare-migration.mjs && npm run build

FROM build AS runtime
ENV NODE_ENV=production \
    WRANGLER_SEND_METRICS=false \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_WRITE_LOGS=false \
    WRANGLER_REGISTRY_PATH=/tmp/artbec/wrangler \
    MINIFLARE_REGISTRY_PATH=/tmp/artbec/miniflare
# Wrangler/workerd run the compiled app. Reuse their existing dependency layer.
RUN mkdir -p /app/.wrangler/state \
    && chown -R node:node /app/.wrangler \
    && chown node:node /app/dist/server
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
