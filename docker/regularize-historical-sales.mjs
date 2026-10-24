import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationRuntime } from './import-initial-data.mjs';

export const repairId = 'customer-sales-through-2026-08-paid-delivered-v1';
const cutoff = '2026-08';

// One-time historical correction explicitly requested by the administrator.
// These deliveries belong to the old history, not today's inventory movements.
export async function regularizeHistoricalSales({ db, sales, now = new Date().toISOString() }) {
  await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
  if (await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(repairId).first()) {
    console.log('Regularização das vendas antigas já concluída; alterações posteriores preservadas.');
    return { skipped: true };
  }

  const saved = (await db.prepare('SELECT id,entity,data,version,deleted FROM operation_changes').all()).results;
  const rows = new Map(saved.map(row => [row.id, row]));
  const items = new Map(sales.map(item => [item.id, item]));
  for (const row of saved) {
    if (row.entity !== 'sale') continue;
    if (row.deleted) items.delete(row.id);
    else items.set(row.id, { ...items.get(row.id), ...JSON.parse(row.data), id: row.id, version: row.version });
  }
  const eligible = [...items.values()].filter(item => item.channel === 'Clientes'
    && typeof item.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.period) && item.period <= cutoff);
  const changed = eligible.filter(item => item.status !== 'paid' || (item.deliveryStatus ?? 'delivered') !== 'delivered');
  const statements = [db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name')
    .bind('system:' + repairId, 'Regularização histórica autorizada')];
  for (const item of changed) {
    const row = rows.get(item.id);
    if (row && row.entity !== 'sale') throw new Error('ID de venda em uso por outra entidade');
    const version = (row?.version ?? 0) + 1;
    const updated = { ...item, id: item.id, status: 'paid', deliveryStatus: 'delivered', version };
    // Preserve the complete previous record for audit, including base-only rows.
    statements.push(db.prepare('INSERT OR IGNORE INTO audit_originals (key,data) VALUES (?,?)')
      .bind('operation_changes:' + item.id, JSON.stringify(item)));
    statements.push(db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'sale',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at")
      .bind(item.id, JSON.stringify(updated), version, now));
  }
  // The full before-images support an exact review/reversal without inventing
  // delivery/payment dates, changing amounts, or touching any stock allocation.
  const details = { cutoff, channel: 'Clientes', eligible: eligible.length, updated: changed.length, before: changed };
  statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(repairId, JSON.stringify(details), now));
  statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));
  await db.batch(statements);
  console.log(`Vendas antigas regularizadas: ${changed.length} atualizadas de ${eligible.length}; estoque preservado.`);
  return { skipped: false, eligible: eligible.length, updated: changed.length };
}

async function main() {
  const config = JSON.parse(await readFile('/app/dist/server/wrangler.docker.json', 'utf8'));
  const source = JSON.parse(await readFile('/app/data/operations.json', 'utf8'));
  const mf = migrationRuntime(config, '/app/.wrangler/state');
  try { await regularizeHistoricalSales({ db: await mf.getD1Database('DB'), sales: source.sales }); }
  finally { await mf.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
