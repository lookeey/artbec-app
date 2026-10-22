import { readFileSync, writeFileSync } from 'node:fs';

const source = '/app/dist/server/wrangler.json';
const config = JSON.parse(readFileSync(source, 'utf8'));
if (!config.d1_databases?.some(db => db.binding === 'DB')) {
  throw new Error('Build sem o binding D1 DB.');
}
for (const db of config.d1_databases) {
  db.remote = false;
  if (db.binding === 'DB') db.migrations_dir = '/app/drizzle';
}
for (const bucket of config.r2_buckets ?? []) bucket.remote = false;
// The proxy terminates TLS; use the public URL for Origin checks in the app.
config.dev = { ...config.dev, local_protocol: 'http', upstream_protocol: 'http' };
if (process.env.ARTBEC_PUBLIC_ORIGIN) {
  const origin = new URL(process.env.ARTBEC_PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('ARTBEC_PUBLIC_ORIGIN deve conter só a origem, como https://app.exemplo.com.');
  }
  config.dev.host = origin.host;
  config.dev.upstream_protocol = origin.protocol.slice(0, -1);
}
config.vars = { ...config.vars };
for (const key of ['AUVO_ENCRYPTION_KEY', 'AUVO_WEBHOOK_SECRET']) {
  if (process.env[key]) config.vars[key] = process.env[key];
}
writeFileSync('/app/dist/server/wrangler.docker.json', JSON.stringify(config), { mode: 0o600 });
