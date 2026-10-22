import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { migrationId, manifestHash, verifyPayload, payloadPath, sha256 } from './portable-data.mjs';

const quote = name => '"' + name.replaceAll('"', '""') + '"';
const internal = name => name.startsWith('sqlite_') || name.startsWith('_cf_') || name === 'd1_migrations' || name === '_artbec_initial_import';

export function migrationRuntime(config, state) {
  const database = config.d1_databases?.find(d => d.binding === 'DB');
  const bucket = config.r2_buckets?.find(b => b.binding === 'DOCUMENTS');
  if (!database?.database_id || !bucket?.bucket_name) throw new Error('Bindings DB/DOCUMENTS ausentes');
  return new Miniflare({
    modules: true, script: 'export default {fetch(){return new Response("migration")}}',
    compatibilityDate: config.compatibility_date,
    d1Databases: { DB: database.preview_database_id || database.database_id },
    r2Buckets: { DOCUMENTS: bucket.bucket_name },
    d1Persist: resolve(state, 'v3/d1'), r2Persist: resolve(state, 'v3/r2'),
  });
}

export async function importInitialData({ db, bucket, root, afterObject }) {
  await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_initial_import (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
  const previous = await db.prepare('SELECT sha256 FROM _artbec_initial_import WHERE id=?').bind(migrationId).first();
  if (previous) {
    if (previous.sha256 !== manifestHash) throw new Error('Identidade da migração já aplicada diverge');
    console.log('Migração inicial já concluída; dados atuais preservados.');
    return { skipped: true };
  }
  const { manifest, dump } = await verifyPayload(root);
  // The app has not started. A failed upload leaves no completion marker and
  // the next start retries it. Completion is committed with the database rows.
  let objects = 0;
  for (const file of manifest.files.filter(f => f.kind === 'storage-object')) {
    const bytes = await readFile(payloadPath(root, file.path));
    await bucket.put(file.originalKey, bytes, { httpMetadata: file.httpMetadata, customMetadata: file.customMetadata });
    const saved = await bucket.get(file.originalKey);
    if (!saved || sha256(Buffer.from(await saved.arrayBuffer())) !== file.sha256) throw new Error('Falha ao restaurar objeto: ' + file.path);
    objects++;
    if (objects % 10 === 0) console.log(`Objetos restaurados: ${objects}/${manifest.storageObjectCount}`);
    await afterObject?.(objects);
  }
  const existing = await db.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger','view')").all();
  const statements = [db.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const type of ['trigger', 'view', 'table']) {
    for (const object of existing.results.filter(o => o.type === type && !internal(o.name)).reverse()) {
      statements.push(db.prepare(`DROP ${type.toUpperCase()} ${quote(object.name)}`));
    }
  }
  for (const [name, table] of Object.entries(dump.tables)) {
    if (internal(name)) throw new Error('Tabela reservada no pacote');
    statements.push(db.prepare(table.schema));
    // Old login sessions must not grant access to the migrated installation.
    if (name === 'app_sessions') continue;
    for (const row of table.rows) {
      const keys = Object.keys(row);
      statements.push(db.prepare(`INSERT INTO ${quote(name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map(key => Array.isArray(row[key]) ? new Uint8Array(row[key]) : row[key])));
    }
  }
  // Triggers go last so restoring rows doesn't generate duplicate audit events.
  for (const object of dump.objects ?? []) if (object.sql) statements.push(db.prepare(object.sql));
  statements.push(db.prepare('INSERT INTO _artbec_initial_import (id,sha256,completed_at) VALUES (?,?,?)').bind(migrationId, manifestHash, new Date().toISOString()));
  console.log(`Restaurando banco em uma transação (${statements.length} comandos).`);
  await db.batch(statements);
  console.log(`Migração inicial concluída: ${manifest.tableCount} tabelas, ${manifest.rowCount - dump.tables.app_sessions.rowCount} registros (sessões antigas invalidadas), ${objects} objetos.`);
  return { skipped: false, objects };
}

async function main() {
  const config = JSON.parse(await readFile('/app/dist/server/wrangler.docker.json', 'utf8'));
  const mf = migrationRuntime(config, '/app/.wrangler/state');
  try {
    await importInitialData({ db: await mf.getD1Database('DB'), bucket: await mf.getR2Bucket('DOCUMENTS'), root: fileURLToPath(new URL('../migration/initial/', import.meta.url)) });
  } finally { await mf.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
