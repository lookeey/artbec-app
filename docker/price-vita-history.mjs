import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationRuntime } from './import-initial-data.mjs';
import { payloadHash as historyHash, validateVitaHistory } from './recover-vita-history.mjs';
import { saleLinesTotalFor } from '../lib/sale-lines.ts';

export const priceRepairId = 'vita-history-prices-2026-04-through-08-v1';
export const pricePayloadHash = '03e10fc6580cb608dba2ee13cafdeaa6c03cd31fe7c861c3f22041526fe36d04';

export function validateVitaHistoryPrices(prices, history) {
  validateVitaHistory(history);
  const expected = new Map(history.sales.filter(item => item.total === null).map(item => [item.id, item]));
  if (prices?.format !== 'artbec-vita-history-prices-v1' || prices.source?.sha256 !== history.source.sha256 || prices.rows?.length !== expected.size) throw new Error('Pacote de preços Vita inválido');
  const rates = new Map(Object.values(prices.prices).map(item => [item.product, item.unitPrice]));
  const seen = new Set();
  for (const row of prices.rows) {
    const original = expected.get(row.id);
    if (!original || seen.has(row.id) || !Array.isArray(row.lineItems) || !row.lineItems.length || row.lineItems.length > 20
      || row.lineItems.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 100000 || !rates.has(line.product) || rates.get(line.product) !== line.unitPrice)
      || !Number.isSafeInteger(row.total) || row.total !== saleLinesTotalFor(original, row.lineItems)) throw new Error('Preço ou quantidade fora do escopo Vita');
    seen.add(row.id);
  }
  if (rates.get('Tratamento Semanal') !== null || [...rates].some(([product, amount]) => product !== 'Tratamento Semanal' && (!Number.isSafeInteger(amount) || amount <= 0))) throw new Error('Tabela histórica Vita inválida');
}

export async function priceVitaHistory({ db, prices, history, now = new Date().toISOString() }) {
  validateVitaHistoryPrices(prices, history);
  await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
  if (await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(priceRepairId).first()) {
    console.log('Preços históricos Vita já preenchidos; alterações posteriores preservadas.');
    return { skipped: true };
  }
  const originals = new Map(history.sales.map(item => [item.id, item]));
  const saved = new Map((await db.prepare('SELECT id,entity,data,version,deleted FROM operation_changes').all()).results.map(row => [row.id, row]));
  const changes = [];
  for (const target of prices.rows) {
    const row = saved.get(target.id), original = originals.get(target.id);
    if (!row || row.entity !== 'sale' || row.deleted) continue;
    const current = JSON.parse(row.data);
    // Update only untouched financial fields of the recovered records. Preserve
    // later edits, filled prices, deleted rows and anything moved into October.
    if (current.total !== null || current.unitPrice !== null || current.quantity !== null || current.lineItems?.length
      || ['channel','period','client','product','date','deliveryDate','source','sourceRow'].some(key => current[key] !== original[key])) continue;
    const single = target.lineItems.length === 1 ? target.lineItems[0] : null;
    const updated = { ...current, lineItems: target.lineItems, quantity: single?.quantity ?? current.quantity,
      unitPrice: single?.unitPrice ?? current.unitPrice, total: target.total, version: row.version + 1 };
    changes.push({ row, current, updated });
  }
  const statements = [db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name')
    .bind('system:' + priceRepairId, 'Preços antigos do Vita solicitados pela administração')];
  for (const {row, updated} of changes) {
    statements.push(db.prepare("UPDATE operation_changes SET data=?,version=?,updated_at=? WHERE id=? AND entity='sale' AND deleted=0 AND version=?")
      .bind(JSON.stringify(updated), updated.version, now, row.id, row.version));
    // changes() counts only the target update, without the audit trigger writes.
    statements.push(db.prepare('SELECT changes() AS updated'));
  }
  const details = { source: prices.source, prices: prices.prices, attemptedIds: changes.map(change => change.row.id), before: changes.map(change => change.current) };
  statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(priceRepairId, JSON.stringify(details), now));
  statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));
  const results = await db.batch(statements);
  const updated = changes.reduce((sum, _, index) => sum + Number(results[2 + index * 2].results[0].updated), 0);
  console.log(`Preços históricos Vita preenchidos: ${updated}; outubro, preços existentes e estoque preservados. Tratamento Semanal permanece sem valor.`);
  return { skipped: false, updated, preserved: prices.rows.length - updated };
}

async function main() {
  const raw = await readFile('/app/migration/vita-history-prices-2026-04-08.json', 'utf8');
  const original = await readFile('/app/migration/vita-history-2026-04-08.json', 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== pricePayloadHash || createHash('sha256').update(original).digest('hex') !== historyHash) throw new Error('Checksum dos preços históricos Vita inválido');
  const config = JSON.parse(await readFile('/app/dist/server/wrangler.docker.json', 'utf8'));
  const mf = migrationRuntime(config, '/app/.wrangler/state');
  try { await priceVitaHistory({ db: await mf.getD1Database('DB'), prices: JSON.parse(raw), history: JSON.parse(original) }); }
  finally { await mf.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
