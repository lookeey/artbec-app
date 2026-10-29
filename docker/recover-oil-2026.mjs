import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationRuntime} from './import-initial-data.mjs';
export const oilRepairId='oil-2026-history-and-monitors-2026-10-29-v1';
export const oilPayloadHash='79f50dc4cebb4fcff3e158efd45e55f76e18d7ea12258f85cd6fb059bdcfd48b';
const name=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/[\s\]]+/g,' ').trim().toLowerCase();
const plate=value=>value.replace(/[^a-z0-9]/gi,'').toUpperCase().replace('FUAE40','FUA2E40');
const slot=item=>JSON.stringify([name(item.technician),item.date,plate(item.plate)]);
const sameRow=(a,b)=>!!a&&!!b&&['id','entity','data','version','deleted','updated_at'].every(key=>a[key]===b[key]);
const validDate=value=>typeof value==='string'&&/^2026-\d{2}-\d{2}$/.test(value)&&value<='2026-10-29'&&Number.isFinite(new Date(value+'T12:00:00Z').getTime())&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function validateOilRecovery(payload){
 if(payload?.format!=='artbec-oil-2026-recovery-v1'||payload.source?.sheet!=='Controle Óleo 26'||payload.source?.through!=='2026-10-29'||!/^[a-f0-9]{64}$/.test(payload.source?.sha256??'')||payload.targets?.length!==23||payload.monitors?.length!==5)throw Error('Pacote de óleo de 2026 inválido');
 const ids=new Set();
 for(const target of payload.targets){const item=target.record;
  if(!/^oil-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|controle-oleo-26-\d+)$/.test(item.id)||ids.has(item.id)||!validDate(item.date)||!item.technician||!/^[A-Z0-9]{6,7}$/.test(item.plate)||item.source!==payload.source.sheet||item.version!==1||!Number.isInteger(item.sourceRow)||item.sourceRow<11||item.sourceRow>235||!['oil','reading'].includes(item.entryType)||!(item.amount===null||Number.isSafeInteger(item.amount)&&item.amount>=0)||!(item.odometer===null||Number.isSafeInteger(item.odometer)&&item.odometer>=0)||!(item.lastChange===''||validDate(item.lastChange)))throw Error('Lançamento fora do escopo do óleo de 2026');
  if(target.expectedDeleted&&(!target.expectedDeleted.deleted||target.expectedDeleted.entity!=='oil'||target.expectedDeleted.id!==item.id||slot(target.original)!==slot(item)))throw Error('Exclusão original divergente');ids.add(item.id);
 }
 const plates=new Set();for(const {record:m} of payload.monitors){
  if(!/^oilMonitor-[a-f0-9-]{36}$/.test(m.id)||plates.has(m.plate)||!['Esdras','Vasco','Genilson','Kevin','Nicolas'].includes(m.technician)||!validDate(m.readingDate)||!validDate(m.oilDate)||m.oilDate>m.readingDate||![m.currentKm,m.oilKm].every(value=>Number.isSafeInteger(value)&&value>=0)||m.currentKm<m.oilKm||m.serviceKm!==null||m.serviceDate!==''||m.importReference?.approximate!==true)throw Error('Referências de óleo inválidas');plates.add(m.plate);
 }
}
export async function recoverOil2026({db,payload,baseOil,now=new Date().toISOString()}){
 validateOilRecovery(payload);
 await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
 if(await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(oilRepairId).first())return {skipped:true};
 const saved=(await db.prepare('SELECT id,entity,data,version,deleted,updated_at FROM operation_changes').all()).results;
 const savedMap=new Map(saved.map(row=>[row.id,row])),initial=new Map(payload.existingSnapshot.map(row=>[row.id,row])),originals=new Map(baseOil.map(item=>[item.id,item]));
 const effective=new Map(originals),deletedSlots=new Set(),changedSlots=new Set();
 const deletionHistory=(await db.prepare("SELECT record_id,before_data FROM audit_events WHERE source_table='operation_changes' AND entity='oil' AND action='deleted'").all()).results;
 const history=new Map();for(const row of deletionHistory)if(row.before_data)history.set(row.record_id,JSON.parse(row.before_data));
 for(const row of saved){if(row.entity!=='oil')continue;const data=JSON.parse(row.data),old=originals.get(row.id);
  if(row.deleted){effective.delete(row.id);const previous=old??(data.technician?data:history.get(row.id));if(previous?.technician)deletedSlots.add(slot(previous));}
  else effective.set(row.id,{...old,...data,id:row.id,version:row.version});
  if(old&&!sameRow(row,initial.get(row.id))){changedSlots.add(slot(old));if(data.technician)changedSlots.add(slot(data));}
 }
 const activeSlots=new Set([...effective.values()].map(slot)),writes=[],preserved=[];
 for(const target of payload.targets){let item=target.record;const row=savedMap.get(item.id);
  if(activeSlots.has(slot(item))||changedSlots.has(slot(item))){preserved.push({id:item.id,reason:'existing-or-edited'});continue;}
  if(target.expectedDeleted){
   if(!sameRow(row,target.expectedDeleted)){preserved.push({id:item.id,reason:'newer-deletion-or-edit'});continue;}
   item={...item,version:row.version+1};writes.push({entity:'oil',item,before:row,original:target.original});
  }else{
   if(row||deletedSlots.has(slot(item))){preserved.push({id:item.id,reason:'existing-or-deleted'});continue;}
   writes.push({entity:'oil',item,before:null});
  }
  activeSlots.add(slot(item));effective.set(item.id,item);
 }
 const monitors=saved.filter(row=>row.entity==='oilMonitor'),monitorWrites=[];
 for(const target of payload.monitors){let item=structuredClone(target.record);const expected=target.expectedExisting;
  const current=monitors.filter(row=>plate(JSON.parse(row.data).plate)===item.plate);
  const active=current.find(row=>!row.deleted);
  // Preserve newer cards and archives, and never create another active card for a plate.
  if(current.some(row=>!sameRow(row,initial.get(row.id)))||expected&&!sameRow(active,expected)||!expected&&active||savedMap.has(item.id)){
   preserved.push({plate:item.plate,reason:'current-monitor-preserved'});continue;
  }
  const previous=active?JSON.parse(active.data):null;
  if(previous&&(previous.currentKm>item.currentKm||previous.readingDate>item.readingDate||previous.oilDate>item.oilDate)){preserved.push({plate:item.plate,reason:'newer-reference'});continue;}
  const importedHistory=item.history.map(event=>({...event,at:now,source:payload.source.sheet}));
  item={...previous,...item,id:active?.id??item.id,version:(active?.version??0)+1,serviceKm:previous?.serviceKm??null,serviceDate:previous?.serviceDate??'',history:[...(previous?.history??[]),...importedHistory].slice(-200),oilRequests:(previous?.oilRequests??[]).map(request=>!request.completedDate&&request.date<=item.oilDate?{...request,completedDate:item.oilDate}:request)};
  monitorWrites.push({entity:'oilMonitor',item,before:active??null});
 }
 const statements=[db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name').bind('system:'+oilRepairId,'Importação do óleo 2026 e referências da planilha')];
 for(const {entity,item,before,original} of [...writes,...monitorWrites]){
  if(original)statements.push(db.prepare('INSERT OR IGNORE INTO audit_originals (key,data) VALUES(?,?)').bind('operation_changes:'+item.id,JSON.stringify(original)));
  if(before)statements.push(db.prepare('UPDATE operation_changes SET data=?,version=?,deleted=0,updated_at=? WHERE id=? AND entity=? AND version=? AND deleted=? AND updated_at=? AND data=?').bind(JSON.stringify(item),item.version,now,item.id,entity,before.version,before.deleted,before.updated_at,before.data));
  else statements.push(db.prepare('INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES(?,?,?,1,0,?)').bind(item.id,entity,JSON.stringify(item),now));
 }
 const details={source:payload.source,changes:[...writes,...monitorWrites].map(({entity,item,before})=>({entity,id:item.id,before})),preserved,excluded:payload.excluded};
 statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES(?,?,?)').bind(oilRepairId,JSON.stringify(details),now));statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));await db.batch(statements);
 const result={skipped:false,inserted:writes.filter(write=>!write.before).length,restored:writes.filter(write=>write.before).length,monitors:monitorWrites.length};
 console.log('Óleo 2026 recuperado:',JSON.stringify(result));return result;
}
async function main(){const raw=await readFile('/app/migration/oil-recovery-2026-10-29.json','utf8');if(createHash('sha256').update(raw).digest('hex')!==oilPayloadHash)throw Error('Checksum do óleo inválido');const config=JSON.parse(await readFile('/app/dist/server/wrangler.docker.json','utf8')),base=JSON.parse(await readFile('/app/data/operations.json','utf8')),mf=migrationRuntime(config,'/app/.wrangler/state');try{await recoverOil2026({db:await mf.getD1Database('DB'),payload:JSON.parse(raw),baseOil:base.oil});}finally{await mf.dispose();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
