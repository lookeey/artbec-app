import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationRuntime} from './import-initial-data.mjs';
export const septemberRepairId='restore-september-2026-fuel-2026-10-29-v1';
export const septemberPayloadHash='f85472626fd3fd379517bb50a34eb9f20d3b68acd7b6e0fcc681f987914e3e8d';
const ownerKey=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const sameDay=(a,b)=>ownerKey(a.technician)===ownerKey(b.technician)&&a.date===b.date;
export function validateSeptemberFuelRestore(payload,baseFuel){
 if(payload?.format!=='artbec-fuel-september-restore-v1'||payload.source?.sheet!=='Controle Gasolina.2026'||payload.source?.period!=='2026-09'||!/^[a-f0-9]{64}$/.test(payload.source.sha256??'')||payload.targets?.length!==14)throw new Error('Pacote de restauração de setembro inválido');
 const originals=new Map(baseFuel.map(item=>[item.id,item])),seen=new Set();
 for(const target of payload.targets){
  const item=target.record,original=originals.get(item.id),date=new Date(item.date+'T12:00:00Z');
  if(!original||seen.has(item.id)||!/^2026-09-\d{2}$/.test(item.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==item.date||item.source!==payload.source.sheet||!['Esdras','Genilson','Kevin','Vasco'].includes(item.technician)
   ||['id','technician','date','plate','amount','source','sourceRow','version'].some(key=>item[key]!==original[key])||!Number.isInteger(target.worksheetRow)||target.worksheetRow<11||!Number.isInteger(target.expectedDeleted?.version)||target.expectedDeleted.version<1||typeof target.expectedDeleted.updatedAt!=='string'||typeof target.expectedDeleted.data!=='string')throw new Error('Restauração fora do escopo de setembro');
  seen.add(item.id);
 }
}

// The administrator requested the missing September history after the earlier
// insert-only import preserved old deletions. Restore only those exact old
// tombstones. Newer deletions and existing person/day records keep priority.
export async function restoreSeptemberFuel({db,payload,baseFuel,now=new Date().toISOString()}){
 validateSeptemberFuelRestore(payload,baseFuel);
 await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
 if(await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(septemberRepairId).first())return {skipped:true};
 const saved=(await db.prepare('SELECT id,entity,data,version,deleted,updated_at FROM operation_changes').all()).results;
 const existing=new Map(saved.map(row=>[row.id,row])),active=new Map(baseFuel.map(item=>[item.id,item]));
 for(const row of saved){if(row.entity!=='fuel')continue;if(row.deleted)active.delete(row.id);else active.set(row.id,{...active.get(row.id),...JSON.parse(row.data)});}
 const changes=[],preserved=[];
 for(const target of payload.targets){
  const row=existing.get(target.record.id),expected=target.expectedDeleted;
  if(!row||row.entity!=='fuel'||!row.deleted||row.version!==expected.version||row.updated_at!==expected.updatedAt||row.data!==expected.data){preserved.push({id:target.record.id,reason:'not-the-old-deletion'});continue;}
  const matches=[...active.values()].filter(item=>sameDay(item,target.record));
  if(matches.length){preserved.push({id:target.record.id,reason:'existing-person-day',existing:matches});continue;}
  const updated={...target.record,version:row.version+1};changes.push({before:row,original:target.record,updated});active.set(updated.id,updated);
 }
 const statements=[db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name').bind('system:'+septemberRepairId,'Restauração da gasolina de setembro solicitada pela administração')];
 for(const {before,original,updated} of changes){
  statements.push(db.prepare('INSERT OR IGNORE INTO audit_originals (key,data) VALUES (?,?)').bind('operation_changes:'+updated.id,JSON.stringify(original)));
  statements.push(db.prepare("UPDATE operation_changes SET data=?,version=?,deleted=0,updated_at=? WHERE id=? AND entity='fuel' AND deleted=1 AND version=? AND updated_at=? AND data=?").bind(JSON.stringify(updated),updated.version,now,updated.id,before.version,before.updated_at,before.data));
  statements.push(db.prepare('SELECT changes() AS restored'));
 }
 const details={source:payload.source,attemptedIds:changes.map(change=>change.updated.id),before:changes.map(change=>({row:change.before,original:change.original})),preserved};
 statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(septemberRepairId,JSON.stringify(details),now));statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));
 const results=await db.batch(statements),restored=changes.reduce((sum,_,index)=>sum+Number(results[3+index*3].results[0].restored),0);
 console.log(`Gasolina de setembro: ${restored} exclusões antigas restauradas; ${payload.targets.length-restored} cadastros atuais preservados; outubro e outras áreas intactos.`);
 return {skipped:false,restored,preserved:payload.targets.length-restored};
}
async function main(){
 const raw=await readFile('/app/migration/fuel-september-restore-2026.json','utf8');if(createHash('sha256').update(raw).digest('hex')!==septemberPayloadHash)throw new Error('Checksum da restauração de setembro inválido');
 const source=JSON.parse(await readFile('/app/data/operations.json','utf8')),config=JSON.parse(await readFile('/app/dist/server/wrangler.docker.json','utf8'));
 const mf=migrationRuntime(config,'/app/.wrangler/state');try{await restoreSeptemberFuel({db:await mf.getD1Database('DB'),payload:JSON.parse(raw),baseFuel:source.fuel});}finally{await mf.dispose();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
