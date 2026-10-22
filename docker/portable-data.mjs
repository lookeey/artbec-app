import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const migrationId = 'artbec-initial-2026-10-22';
export const manifestHash = '016686e828e0cb41f3d872e6660628b02dfb7e146511b5fdbda5e8e99a2f236b';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function payloadPath(root, name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes(':') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Caminho inválido no manifesto');
  const path = resolve(root, name);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Caminho fora do pacote');
  return path;
}

export async function verifyPayload(root) {
  const bytes = await readFile(resolve(root, 'manifest.json'));
  if (sha256(bytes) !== manifestHash) throw new Error('Manifesto da migração inicial alterado');
  const manifest = JSON.parse(bytes);
  if (manifest.format !== 'artbec-portable-v1' || !manifest.complete) throw new Error('Exportação incompleta');
  const paths = new Set();
  for (const file of manifest.files) {
    if (paths.has(file.path)) throw new Error('Arquivo duplicado no manifesto');
    paths.add(file.path);
    const content = await readFile(payloadPath(root, file.path));
    if (content.length !== file.size || sha256(content) !== file.sha256) throw new Error('Arquivo corrompido: ' + file.path);
  }
  const dump = JSON.parse(await readFile(resolve(root, 'database/database.json'), 'utf8'));
  if (dump.format !== 'artbec-d1-dump-v1' || Object.keys(dump.tables).length !== manifest.tableCount || dump.tableCount !== manifest.tableCount) throw new Error('Contagem de tabelas inválida');
  let rows = 0;
  for (const table of Object.values(dump.tables)) {
    if (!table.schema || table.rows.length !== table.rowCount) throw new Error('Tabela incompleta');
    rows += table.rowCount;
  }
  if (rows !== manifest.rowCount || manifest.files.filter(f => f.kind === 'storage-object').length !== manifest.storageObjectCount) throw new Error('Contagem de registros/objetos inválida');
  return { manifest, dump };
}

// These sources are imported into the compiled app; they must match the dump.
export async function prepareSources(root, project) {
  const { manifest } = await verifyPayload(root);
  for (const [source, target] of Object.entries({ finance: 'source', notes: 'notes', management: 'management', operations: 'operations' })) {
    await copyFile(resolve(root, 'base', source + '.json'), resolve(project, 'data', target + '.json'));
  }
  for (const file of manifest.files.filter(f => f.kind === 'static-asset')) {
    if (!file.path.startsWith('assets/public/')) throw new Error('Asset fora de public');
    const target = payloadPath(resolve(project, 'public'), file.path.slice('assets/public/'.length));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(payloadPath(root, file.path), target);
  }
  console.log(`Pacote verificado: ${manifest.tableCount} tabelas, ${manifest.rowCount} registros, ${manifest.storageObjectCount} objetos.`);
}
