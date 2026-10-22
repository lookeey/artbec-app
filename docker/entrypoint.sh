#!/bin/sh
set -eu
node /app/docker/configure.mjs
node /app/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB \
  --local --config /app/dist/server/wrangler.docker.json \
  --persist-to /app/.wrangler/state
node /app/docker/import-initial-data.mjs
exec node /app/node_modules/wrangler/bin/wrangler.js dev \
  --local --config /app/dist/server/wrangler.docker.json \
  --persist-to /app/.wrangler/state --ip 0.0.0.0 --port 3000 \
  --local-protocol http --inspector-port 0
