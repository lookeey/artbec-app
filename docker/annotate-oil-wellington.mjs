import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationRuntime} from './import-initial-data.mjs';
export const wellingtonRepairId='oil-wellington-labels-2026-10-29-v1';
export const wellingtonPayloadHash='1f0379320acaac123870beba97ed6bff18326fe262135622a93c7f44735e6eea';
export function validateWellington(payload){
 if(payload?.format!=='artbec-oil-wellington-v1'||payload.source?.sheet!=='Controle Óleo 26'||!/^[a-f0-9]{64}$/.test(payload.source?.sha256??'')||payload.targets?.length!==12)throw Error('Pacote Wellington inválido');
 const ids=new Set();for(const {before,updated,evidence,worksheetRow} of payload.targets){
  if(ids.has(before.id)||!before.id.startsWith('oil-')||!before.date.startsWith('2026-')||updated.notes?.split(' · ')[0]!=='Trocado no Wellington'||updated.entryType!=='oil'||updated.version!==before.version+1||!isDeepStrictEqual({...updated,notes:before.notes,entryType:before.entryType,version:before.version},{...before,entryType:before.entryType})||!Number.isInteger(worksheetRow)||!evidence?.some(item=>/^([H-K])\d+$/.test(item.cell)&&/\bwell(?:y)?\b/i.test(item.value)))throw Error('Anotação Wellington fora do escopo');ids.add(before.id);
 }
}
export async function annotateWellington({db,payload,baseOil,now=new Date().toISOString()}){
 validateWellington(payload);await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
 if(await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(wellingtonRepairId).first())return {skipped:true};
 const saved=new Map((await db.prepare("SELECT id,entity,data,version,deleted,updated_at FROM operation_changes WHERE entity='oil'").all()).results.map(row=>[row.id,row]));
 const originals=new Map(baseOil.map(item=>[item.id,item])),writes=[],preserved=[];
 for(const target of payload.targets){const row=saved.get(target.before.id),actual=row?{...originals.get(row.id),...JSON.parse(row.data),version:row.version}:originals.get(target.before.id);
  if(row?.deleted||!isDeepStrictEqual(actual,target.before)||target.expected===null&&row||target.expected==='oil-recovery'&&!row||target.expected&&typeof target.expected==='object'&&(!row||['version','deleted','updated_at','data'].some(key=>row[key]!==target.expected[key]))){preserved.push(target.before.id);continue;}
  writes.push({target,row});
 }
 const statements=[db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name').bind('system:'+wellingtonRepairId,'Identificação das trocas de óleo no Wellington')];
 for(const {target:{before,updated},row} of writes){
  statements.push(db.prepare('INSERT OR IGNORE INTO audit_originals (key,data) VALUES (?,?)').bind('operation_changes:'+before.id,JSON.stringify(before)));
  if(row)statements.push(db.prepare("UPDATE operation_changes SET data=?,version=?,updated_at=? WHERE id=? AND entity='oil' AND deleted=0 AND version=? AND data=? AND updated_at=?").bind(JSON.stringify(updated),updated.version,now,updated.id,row.version,row.data,row.updated_at));
  else statements.push(db.prepare("INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'oil',?,1,0,?)").bind(updated.id,JSON.stringify(updated),now));
 }
 const details={source:payload.source,before:writes.map(({target,row})=>({record:target.before,row:row??null})),preserved};
 statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(wellingtonRepairId,JSON.stringify(details),now));statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));await db.batch(statements);
 console.log(`Wellington: ${writes.length} observações identificadas; ${preserved.length} edições posteriores preservadas.`);return {skipped:false,annotated:writes.length,preserved:preserved.length};
}
async function main(){const raw=await readFile('/app/migration/oil-wellington-2026.json','utf8');if(createHash('sha256').update(raw).digest('hex')!==wellingtonPayloadHash)throw Error('Checksum Wellington inválido');const source=JSON.parse(await readFile('/app/data/operations.json','utf8')),config=JSON.parse(await readFile('/app/dist/server/wrangler.docker.json','utf8')),mf=migrationRuntime(config,'/app/.wrangler/state');try{await annotateWellington({db:await mf.getD1Database('DB'),payload:JSON.parse(raw),baseOil:source.oil});}finally{await mf.dispose();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();