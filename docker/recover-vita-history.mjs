import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationRuntime } from './import-initial-data.mjs';

export const repairId = 'vita-deliveries-2026-04-through-08-v1';
export const payloadHash = '8f4240b8c5205329205e3e964dce14732880d1629e949089acccdb678d2616a7';
const expectedCounts = { '2026-04': 10, '2026-05': 10, '2026-06': 6, '2026-07': 13, '2026-08': 11 };
const sourceMonths = { 'V. Abr Vita': '2026-04', 'V. Maio Vita': '2026-05', 'V. Junho Vita': '2026-06', 'V. Julho Vita': '2026-07', 'V. Agosto Vita': '2026-08' };
const sourceKey = item => item.channel === 'Vita' && item.source && item.sourceRow ? `${item.source.trim()}|${item.sourceRow}` : '';

export function validateVitaHistory(payload) {
  if (payload?.format !== 'artbec-vita-history-v1' || !/^[a-f0-9]{64}$/.test(payload.source?.sha256 ?? '') || !Array.isArray(payload.sales) || payload.sales.length !== 50) throw new Error('Pacote do histórico Vita inválido');
  const ids = new Set(), counts = {};
  for (const item of payload.sales) {
    const parsedDate = new Date(item.deliveryDate + 'T12:00:00Z');
    const validDate = Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === item.deliveryDate;
    const expectedId = `sale-${item.source?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${item.sourceRow}`;
    if (!validDate || item.channel !== 'Vita' || !['Vita Morumbi', 'Vita Higienópolis'].includes(item.client)
      || sourceMonths[item.source] !== item.period || !item.deliveryDate.startsWith(item.period + '-')
      || item.date !== item.deliveryDate || !item.product || !Number.isInteger(item.sourceRow)
      || item.id !== expectedId || ids.has(item.id) || item.version !== 1 || item.status !== 'review'
      || item.deliveryStatus !== 'delivered' || item.deliveredAt !== '' || item.stockItems?.length !== 0
      || item.quantity !== null || item.unitPrice !== null
      || (item.total !== null && (!Number.isSafeInteger(item.total) || item.total < 0))) throw new Error('Saída fora do escopo da recuperação Vita');
    ids.add(item.id); counts[item.period] = (counts[item.period] ?? 0) + 1;
  }
  for (const [period, count] of Object.entries(expectedCounts)) if (counts[period] !== count) throw new Error('Contagem do histórico Vita diverge da planilha');
}

// Run after the portable import, so a new volume and an existing production volume
// receive the same missing rows. Insert-only writes preserve edits and tombstones.
export async function recoverVitaHistory({ db, payload, baseSales, now = new Date().toISOString() }) {
  validateVitaHistory(payload);
  await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
  if (await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(repairId).first()) {
    console.log('Histórico Vita já recuperado; alterações posteriores preservadas.');
    return { skipped: true };
  }
  const saved = (await db.prepare('SELECT id,entity,data,version,deleted FROM operation_changes').all()).results;
  const existingIds = new Set([...baseSales.map(item => item.id), ...saved.map(row => row.id)]);
  const existingSources = new Set(baseSales.map(sourceKey).filter(Boolean));
  for (const row of saved) {
    if (row.entity !== 'sale') continue;
    const key = sourceKey(JSON.parse(row.data));
    if (key) existingSources.add(key);
  }
  const missing = payload.sales.filter(item => !existingIds.has(item.id) && !existingSources.has(sourceKey(item)));
  const statements = [db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name')
    .bind('system:' + repairId, 'Recuperação do histórico Vita')];
  for (const item of missing) {
    statements.push(db.prepare("INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'sale',?,1,0,?)")
      .bind(item.id, JSON.stringify(item), now));
  }
  const details = { source: payload.source, records: payload.sales.length, insertedIds: missing.map(item => item.id), preserved: payload.sales.length - missing.length };
  statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(repairId, JSON.stringify(details), now));
  statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));
  await db.batch(statements);
  console.log(`Histórico Vita recuperado: ${missing.length} saídas incluídas; ${details.preserved} existentes preservadas; estoque atual inalterado.`);
  return { skipped: false, inserted: missing.length, preserved: details.preserved };
}

async function main() {
  const raw = await readFile('/app/migration/vita-history-2026-04-08.json', 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== payloadHash) throw new Error('Checksum do histórico Vita inválido');
  const payload = JSON.parse(raw);
  const config = JSON.parse(await readFile('/app/dist/server/wrangler.docker.json', 'utf8'));
  const source = JSON.parse(await readFile('/app/data/operations.json', 'utf8'));
  const mf = migrationRuntime(config, '/app/.wrangler/state');
  try { await recoverVitaHistory({ db: await mf.getD1Database('DB'), payload, baseSales: source.sales }); }
  finally { await mf.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
