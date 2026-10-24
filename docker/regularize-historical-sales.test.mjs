import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { regularizeHistoricalSales, repairId } from './regularize-historical-sales.mjs';

const options = { modules: true, script: '', d1Databases: ['DB'] };
const sale = (id, overrides = {}) => ({ id, period: '2026-08', channel: 'Clientes', client: 'Cliente',
  product: 'Produto antigo', total: 6500, date: '', dateNote: 'Data desconhecida', status: 'pending',
  deliveryStatus: 'pending', deliveryDate: '', deliveredAt: '', version: 0, ...overrides });
const snapshot = async db => (await db.prepare('SELECT * FROM operation_changes ORDER BY id').all()).results;
async function schema(db) {
  for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    await db.batch((await readFile('drizzle/' + file, 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
}
async function save(db, item, entity = 'sale', deleted = 0, version = 3) {
  await db.prepare('INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(item.id, entity, JSON.stringify(item), version, deleted, 'before').run();
}

test('historical correction is atomic, scoped, audited, preserves inventory and runs only once', async () => {
  const mf = new Miniflare(options);
  try {
    const db = await mf.getD1Database('DB'); await schema(db);
    const sales = [sale('base'), sale('old', { period: '2025-03' }), sale('paid', { status: 'paid', deliveryStatus: undefined }),
      sale('deleted'), sale('moved'), sale('partner'), sale('september', { period: '2026-09' }),
      sale('october', { period: '2026-10' }), sale('bad', { period: '2026-00' }), sale('undated', { period: '' }),
      sale('vita', { channel: 'Vita' }), sale('academy', { channel: 'Academia' }),
      sale('already', { status: 'paid', deliveryStatus: 'delivered' })];
    await save(db, sale('deleted'), 'sale', 1);
    await save(db, sale('moved', { period: '2026-09' }));
    await save(db, sale('partner', { channel: 'Vita' }));
    await save(db, { id: 'base', product: 'Descrição atual', total: 9000, status: 'review' });
    await save(db, sale('db-only', { period: '2026-01', stockItems: [{ productId: 'stock', quantity: 2 }], lineItems: [{ product: 'Kit', quantity: 2 }], payment: 'Pix' }));
    await save(db, { id: 'stock', product: 'Produto', initial: 10, incoming: 2, outgoing: 5 }, 'stock');
    await save(db, { id: 'movement', saleId: 'db-only', quantity: 2 }, 'stockMovement');
    await db.prepare("INSERT INTO finance_changes VALUES ('monthly','{\"status\":\"pending\"}',2,'before')").run();
    const before = await snapshot(db), auditBefore = await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n');
    const broken = { prepare: sql => db.prepare(sql), batch: statements => db.batch([...statements, db.prepare('INSERT INTO missing_table VALUES (1)')]) };
    await assert.rejects(regularizeHistoricalSales({ db: broken, sales }));
    assert.deepEqual(await snapshot(db), before);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n'), auditBefore);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs').first('n'), 0);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'), 0);

    assert.deepEqual(await regularizeHistoricalSales({ db, sales, now: '2026-10-23T12:00:00.000Z' }), { skipped: false, eligible: 5, updated: 3 });
    const after = await snapshot(db), changedIds = ['base', 'old', 'db-only'];
    for (const row of before.filter(r => !changedIds.includes(r.id))) assert.deepEqual(after.find(r => r.id === row.id), row, row.id);
    assert.equal(after.some(r => r.id === 'already' || r.id === 'paid'), false);
    for (const id of changedIds) {
      const row = after.find(r => r.id === id), data = JSON.parse(row.data);
      assert.equal(data.status, 'paid'); assert.equal(data.deliveryStatus, 'delivered');
      assert.equal(data.deliveredAt, ''); assert.equal(data.date, '');
      assert.equal(row.version, id === 'old' ? 1 : 4); assert.equal(data.version, row.version);
    }
    const base = JSON.parse(after.find(r => r.id === 'base').data);
    assert.equal(base.total, 9000); assert.equal(base.product, 'Descrição atual');
    const dbOnlyBefore = JSON.parse(before.find(r => r.id === 'db-only').data), dbOnlyAfter = JSON.parse(after.find(r => r.id === 'db-only').data);
    assert.deepEqual(dbOnlyAfter, { ...dbOnlyBefore, status: 'paid', deliveryStatus: 'delivered', version: 4 });
    assert.equal(await db.prepare("SELECT data FROM finance_changes WHERE id='monthly'").first('data'), '{"status":"pending"}');
    const audit = (await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:' + repairId).all()).results;
    assert.equal(audit.length, 3); assert.ok(audit.every(row => row.source_table === 'operation_changes' && row.entity === 'sale'));
    assert.equal(JSON.parse(audit.find(row => row.record_id === 'old').before_data).status, 'pending');
    const details = JSON.parse(await db.prepare('SELECT details FROM _artbec_data_repairs WHERE id=?').bind(repairId).first('details'));
    assert.equal(details.before.length, 3); assert.equal(details.before.find(item => item.id === 'base').total, 9000);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'), 0);
    // Later manual changes and new historical entries must survive subsequent starts.
    await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.status','pending'),version=5 WHERE id='base'").run();
    await save(db, sale('added-later'));
    const later = await snapshot(db), auditLater = await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n');
    assert.deepEqual(await regularizeHistoricalSales({ db, sales }), { skipped: true });
    assert.deepEqual(await snapshot(db), later);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n'), auditLater);
  } finally { await mf.dispose(); }
});

test('real migrated export: only eligible customer sales change; all other records and stock stay exact', async () => {
  const mf = new Miniflare(options);
  try {
    const db = await mf.getD1Database('DB');
    const dump = JSON.parse(await readFile('migration/initial/database/database.json', 'utf8'));
    const source = JSON.parse(await readFile('migration/initial/base/operations.json', 'utf8'));
    const statements = [];
    for (const [name, table] of Object.entries(dump.tables)) {
      statements.push(db.prepare(table.schema));
      for (const row of table.rows) {
        const keys = Object.keys(row);
        statements.push(db.prepare(`INSERT INTO "${name}" (${keys.map(key => '"' + key + '"').join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map(key => Array.isArray(row[key]) ? new Uint8Array(row[key]) : row[key])));
      }
    }
    for (const object of dump.objects ?? []) if (object.sql) statements.push(db.prepare(object.sql));
    await db.batch(statements);
    const before = await snapshot(db), tables = {};
    for (const name of Object.keys(dump.tables).filter(name => !['operation_changes', 'audit_originals', 'audit_events'].includes(name))) tables[name] = (await db.prepare(`SELECT * FROM "${name}"`).all()).results;
    const result = await regularizeHistoricalSales({ db, sales: source.sales });
    assert.ok(result.updated > 0);
    const after = await snapshot(db);
    const effective = new Map(source.sales.map(item => [item.id, item]));
    for (const row of after.filter(row => row.entity === 'sale')) {
      if (row.deleted) effective.delete(row.id);
      else effective.set(row.id, { ...effective.get(row.id), ...JSON.parse(row.data) });
    }
    const eligible = [...effective.values()].filter(item => item.channel === 'Clientes' && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.period) && item.period <= '2026-08');
    assert.equal(eligible.length, result.eligible);
    assert.ok(eligible.every(item => item.status === 'paid' && (item.deliveryStatus ?? 'delivered') === 'delivered'));
    const updated = after.filter(row => !before.some(old => JSON.stringify(old) === JSON.stringify(row)));
    assert.equal(updated.length, result.updated);
    for (const row of updated) {
      const item = JSON.parse(row.data);
      assert.equal(row.entity, 'sale'); assert.equal(row.deleted, 0);
      assert.equal(item.channel, 'Clientes'); assert.match(item.period, /^\d{4}-(0[1-9]|1[0-2])$/); assert.ok(item.period <= '2026-08');
      const previous = { ...source.sales.find(sale => sale.id === row.id), ...JSON.parse(before.find(old => old.id === row.id)?.data ?? '{}') };
      for (const key of Object.keys(previous).filter(key => !['status', 'deliveryStatus', 'version'].includes(key))) assert.deepEqual(item[key], previous[key], row.id + ':' + key);
    }
    for (const [name, rows] of Object.entries(tables)) assert.deepEqual((await db.prepare(`SELECT * FROM "${name}"`).all()).results, rows, name);
    for (const row of before.filter(row => !updated.some(next => next.id === row.id))) assert.deepEqual(after.find(next => next.id === row.id), row);
    assert.deepEqual(await regularizeHistoricalSales({ db, sales: source.sales }), { skipped: true });
    assert.deepEqual(await snapshot(db), after);
  } finally { await mf.dispose(); }
});

test('persistent marker survives a runtime restart and preserves later manual edits', async () => {
  const prefix = resolve(tmpdir(), 'artbec-sales-repair-');
  const state = await mkdtemp(prefix);
  const persistent = { ...options, d1Persist: state };
  let mf = new Miniflare(persistent);
  try {
    let db = await mf.getD1Database('DB'); await schema(db);
    const sales = [sale('restart')];
    assert.equal((await regularizeHistoricalSales({ db, sales })).updated, 1);
    await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.status','pending'),version=2 WHERE id='restart'").run();
    await mf.dispose(); mf = new Miniflare(persistent); db = await mf.getD1Database('DB');
    assert.deepEqual(await regularizeHistoricalSales({ db, sales }), { skipped: true });
    assert.equal(JSON.parse(await db.prepare("SELECT data FROM operation_changes WHERE id='restart'").first('data')).status, 'pending');
  } finally {
    await mf.dispose();
    if (!state.startsWith(prefix)) throw new Error('Unexpected test state path');
    await rm(state, { recursive: true, force: true });
  }
});
