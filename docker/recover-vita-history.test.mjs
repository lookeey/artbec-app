import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { recoverVitaHistory, repairId, payloadHash, validateVitaHistory } from './recover-vita-history.mjs';

const options = { modules: true, script: '', d1Databases: ['DB'] };
const payload = JSON.parse(await readFile('migration/vita-history-2026-04-08.json', 'utf8'));
const source = JSON.parse(await readFile('migration/initial/base/operations.json', 'utf8'));
const snapshot = async (db, table = 'operation_changes') => (await db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()).results;
async function migratedExport(db) {
  const dump = JSON.parse(await readFile('migration/initial/database/database.json', 'utf8'));
  const statements = [];
  for (const table of Object.values(dump.tables)) {
    statements.push(db.prepare(table.schema));
    for (const row of table.rows) {
      const keys = Object.keys(row);
      statements.push(db.prepare(`INSERT INTO "${/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[\x60"]?([^\x60"\s(]+)/i.exec(table.schema)[1]}" (${keys.map(key => '"' + key + '"').join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map(key => Array.isArray(row[key]) ? new Uint8Array(row[key]) : row[key])));
    }
  }
  for (const object of dump.objects) if (object.sql) statements.push(db.prepare(object.sql));
  await db.batch(statements);
  return dump;
}
async function schema(db) {
  for (const file of (await readdir('drizzle')).filter(file => file.endsWith('.sql')).sort()) {
    await db.batch((await readFile('drizzle/' + file, 'utf8')).split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
}
async function save(db, item, entity = 'sale', deleted = 0) {
  await db.prepare('INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(item.id, entity, JSON.stringify(item), item.version, deleted, 'before').run();
}

test('real export: restores 49 missing Vita rows, preserves July and October, audit, stock and restart edits', async () => {
  const state = await mkdtemp(join(tmpdir(), 'artbec-vita-history-'));
  let mf = new Miniflare({ ...options, d1Persist: state });
  try {
    let db = await mf.getD1Database('DB');
    const dump = await migratedExport(db);
    const october = { ...payload.sales[0], id: 'sale-manual-october', period: '2026-10', date: '', deliveryDate: '2026-10-15', source: 'Cadastro no site', sourceRow: 0, product: 'Outubro já preenchido', total: 20280, status: 'pending', version: 7, stockItems: [{productId:'stock-existing',quantity:2}] };
    await save(db, october);
    const before = await snapshot(db), preserved = {};
    for (const name of Object.keys(dump.tables).filter(name => !['operation_changes', 'audit_context', 'audit_events'].includes(name))) preserved[name] = await snapshot(db, name);
    const result = await recoverVitaHistory({ db, payload, baseSales: source.sales, now: '2026-10-27T12:00:00Z' });
    assert.deepEqual(result, { skipped: false, inserted: 49, preserved: 1 });
    const after = await snapshot(db);
    assert.equal(after.length, before.length + 49);
    for (const row of before) assert.deepEqual(after.find(item => item.id === row.id), row);
    for (const [name, rows] of Object.entries(preserved)) assert.deepEqual(await snapshot(db, name), rows, name);
    assert.equal(after.some(row => row.id === 'sale-v-julho-vita-21'), false, 'existing base-only July row must not be duplicated');
    for (const item of payload.sales.filter(item => !source.sales.some(base => base.id === item.id))) {
      const row = after.find(row => row.id === item.id);
      assert.equal(row.entity, 'sale'); assert.equal(row.deleted, 0); assert.equal(row.version, 1);
      assert.deepEqual(JSON.parse(row.data), item);
      assert.equal(item.total, null); assert.equal(item.status, 'review'); assert.deepEqual(item.stockItems, []);
    }
    const effective = new Map(source.sales.map(item => [item.id, item]));
    for (const row of after.filter(row => row.entity === 'sale')) { if (row.deleted) effective.delete(row.id); else effective.set(row.id, JSON.parse(row.data)); }
    for (const [month, morumbi, higienopolis] of [['2026-04',4,6],['2026-05',5,5],['2026-06',2,4],['2026-07',5,8],['2026-08',3,8]]) {
      const sales = [...effective.values()].filter(item => item.channel === 'Vita' && item.period === month);
      assert.equal(sales.filter(item => item.client === 'Vita Morumbi').length, morumbi);
      assert.equal(sales.filter(item => item.client === 'Vita Higienópolis').length, higienopolis);
    }
    const audit = (await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:' + repairId).all()).results;
    assert.equal(audit.length, 49); assert.ok(audit.every(row => row.source_table === 'operation_changes' && row.entity === 'sale' && row.action === 'created'));
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'), 0);
    const marker = JSON.parse(await db.prepare('SELECT details FROM _artbec_data_repairs WHERE id=?').bind(repairId).first('details'));
    assert.equal(marker.insertedIds.length, 49); assert.deepEqual(marker.source, payload.source);
    await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.product','Edição posterior'),version=2 WHERE id=?").bind(payload.sales[0].id).run();
    await db.prepare("UPDATE operation_changes SET data='{}',deleted=1,version=2 WHERE id=?").bind(payload.sales[1].id).run();
    const later = await snapshot(db), auditLater = await snapshot(db, 'audit_events');
    await mf.dispose(); mf = new Miniflare({ ...options, d1Persist: state }); db = await mf.getD1Database('DB');
    assert.deepEqual(await recoverVitaHistory({db,payload,baseSales:source.sales}), {skipped:true});
    assert.deepEqual(await snapshot(db), later); assert.deepEqual(await snapshot(db,'audit_events'), auditLater);
  } finally { await mf.dispose(); await rm(state, {recursive:true,force:true}); }
});

test('insert-only recovery preserves prior edits, deletions, source-row duplicates and other entities; failures roll back', async () => {
  const mf = new Miniflare(options);
  try {
    const db = await mf.getD1Database('DB'); await schema(db);
    await save(db, {...payload.sales[0],product:'{}',version:9}, 'sale', 1);
    await save(db, {...payload.sales[1],product:'Cadastro já corrigido',total:7000,status:'paid',version:6});
    await save(db, {...payload.sales[2],version:4}, 'stock');
    await save(db, {...payload.sales[3],id:'sale-already-imported',version:3});
    const before = await snapshot(db), auditsBefore = await snapshot(db,'audit_events');
    await db.prepare(`CREATE TRIGGER fail_vita BEFORE INSERT ON operation_changes WHEN NEW.id='${payload.sales[5].id}' BEGIN SELECT RAISE(ABORT,'forced rollback'); END`).run();
    await assert.rejects(recoverVitaHistory({db,payload,baseSales:source.sales}), /forced rollback/);
    assert.deepEqual(await snapshot(db), before); assert.deepEqual(await snapshot(db,'audit_events'), auditsBefore);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs').first('n'),0);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
    await db.prepare('DROP TRIGGER fail_vita').run();
    assert.deepEqual(await recoverVitaHistory({db,payload,baseSales:source.sales}),{skipped:false,inserted:45,preserved:5});
    const after=await snapshot(db); for(const row of before)assert.deepEqual(after.find(item=>item.id===row.id),row);
    assert.equal(after.some(row=>row.id===payload.sales[3].id),false);
  } finally { await mf.dispose(); }
});

test('payload is scoped, checksum-pinned, preserves missing prices and runs after initial import', async () => {
  validateVitaHistory(payload);
  assert.equal(createHash('sha256').update(await readFile('migration/vita-history-2026-04-08.json')).digest('hex'),payloadHash);
  assert.equal(payload.sales.filter(item=>item.total===null).length,49);
  assert.equal(payload.sales.find(item=>item.total!==null).id,'sale-v-julho-vita-21');
  for(const update of [{period:'2026-10'}, {channel:'Clientes'}, {stockItems:[{productId:'stock-test',quantity:1}]}, {deliveryDate:'2026-04-31'}, {status:'paid'}, {total:'0'}]){
    const invalid=structuredClone(payload);Object.assign(invalid.sales[0],update);assert.throws(()=>validateVitaHistory(invalid));
  }
  const entrypoint=await readFile('docker/entrypoint.sh','utf8');
  assert.ok(entrypoint.indexOf('import-initial-data.mjs')<entrypoint.indexOf('recover-vita-history.mjs'));
  assert.ok(entrypoint.indexOf('recover-vita-history.mjs')<entrypoint.indexOf('exec node'));
});
