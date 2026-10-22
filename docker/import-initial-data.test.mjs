import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importInitialData, migrationRuntime } from './import-initial-data.mjs';
import { verifyPayload, sha256, payloadPath } from './portable-data.mjs';

const root = fileURLToPath(new URL('../migration/initial/', import.meta.url));
const config = { compatibility_date: '2026-05-15', d1_databases: [{ binding: 'DB', database_id: '00000000-0000-4000-8000-000000000000' }], r2_buckets: [{ binding: 'DOCUMENTS', bucket_name: 'migration-test' }] };
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const canonical = rows => rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();

test('real export: failure recovery, exact restore, persistent idempotency and Wrangler bindings', async () => {
  await mkdir('tmp', { recursive: true });
  const state = await mkdtemp(resolve('tmp', 'import-'));
  let mf = migrationRuntime(config, state);
  try {
    console.log('Test: opening D1 and R2', state);
    let db = await mf.getD1Database('DB'), bucket = await mf.getR2Bucket('DOCUMENTS');
    console.log('Test: creating production fixture');
    await db.prepare('CREATE TABLE production_only (id TEXT)').run();
    await db.prepare("INSERT INTO production_only VALUES ('old')").run();
    await db.prepare('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)').run();
    await db.prepare("INSERT INTO d1_migrations VALUES (1,'existing.sql','now')").run();
    await assert.rejects(importInitialData({ db, bucket, root, afterObject: n => { if (n === 2) throw new Error('simulated upload failure'); } }), /simulated upload failure/);
    console.log('Test: upload failure recovered');
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_initial_import').first('n'), 0);
    assert.equal(await db.prepare('SELECT id FROM production_only').first('id'), 'old');

    // Force failure at the end of the D1 transaction, after DROP/CREATE/INSERT.
    const brokenDb = { prepare: sql => db.prepare(sql), batch: statements => db.batch([...statements, db.prepare('INSERT INTO missing_table VALUES (1)')]) };
    await assert.rejects(importInitialData({ db: brokenDb, bucket, root }));
    console.log('Test: database failure rolled back');
    assert.equal(await db.prepare('SELECT id FROM production_only').first('id'), 'old');
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_initial_import').first('n'), 0);

    assert.equal((await importInitialData({ db, bucket, root })).skipped, false);
    const { manifest, dump } = await verifyPayload(root);
    for (const [name, table] of Object.entries(dump.tables)) {
      const actual = (await db.prepare(`SELECT * FROM ${quote(name)}`).all()).results;
      assert.deepEqual(canonical(actual), canonical(name === 'app_sessions' ? [] : table.rows), name);
    }
    assert.equal(await db.prepare('SELECT name FROM d1_migrations').first('name'), 'existing.sql');
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
    for (const file of manifest.files.filter(f => f.kind === 'storage-object')) {
      const object = await bucket.get(file.originalKey);
      assert.equal(sha256(Buffer.from(await object.arrayBuffer())), file.sha256);
      assert.deepEqual(object.customMetadata, file.customMetadata);
      for (const [key, value] of Object.entries(file.httpMetadata)) assert.equal(object.httpMetadata[key], value);
    }
    const row = dump.tables.finance_changes.rows[0];
    await db.prepare("UPDATE finance_changes SET data='{}',version=version+1 WHERE id=?").bind(row.id).run();
    const removed = manifest.files.find(f => f.kind === 'storage-object');
    await bucket.delete(removed.originalKey);
    const changed = manifest.files.filter(f => f.kind === 'storage-object')[1];
    await bucket.put(changed.originalKey, 'edited after migration');
    const auditCount = await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n');
    await mf.dispose();
    // Reopen with binding names used by Wrangler's D1 CLI and R2 CLI, proving
    // persistence is keyed by database ID / bucket name rather than JS binding.
    const { Miniflare } = await import('miniflare');
    mf = new Miniflare({ modules: true, script: '', d1Databases: { DATABASE: config.d1_databases[0].database_id }, r2Buckets: { BUCKET: 'migration-test' }, d1Persist: resolve(state, 'v3/d1'), r2Persist: resolve(state, 'v3/r2') });
    db = await mf.getD1Database('DATABASE'); bucket = await mf.getR2Bucket('BUCKET');
    assert.equal((await importInitialData({ db, bucket, root })).skipped, true);
    assert.equal(await db.prepare('SELECT data FROM finance_changes WHERE id=?').bind(row.id).first('data'), '{}');
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n'), auditCount);
    assert.equal(await bucket.get(removed.originalKey), null);
    assert.equal(await (await bucket.get(changed.originalKey)).text(), 'edited after migration');
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_initial_import').first('n'), 1);
  } finally { await mf.dispose(); await rm(state, { recursive: true, force: true }); }
});
