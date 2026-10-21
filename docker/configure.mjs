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
config.vars = { ...config.vars };
for (const key of ['AUVO_ENCRYPTION_KEY', 'AUVO_WEBHOOK_SECRET']) {
  if (process.env[key]) config.vars[key] = process.env[key];
}
writeFileSync('/app/dist/server/wrangler.docker.json', JSON.stringify(config), { mode: 0o600 });
