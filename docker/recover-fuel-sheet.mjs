import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationRuntime} from './import-initial-data.mjs';

export const fuelRepairId='fuel-sheet-additions-2026-10-29-v1';
export const fuelPayloadHash='950e67755032dbac2d0b56d44e7794441d6eef3b891243eabd6e4db5ee7cdee8';
const nameKey=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const dayKey=item=>JSON.stringify([nameKey(item.technician),item.date]);
const recordKey=item=>JSON.stringify([nameKey(item.technician),item.date,(item.plate??'').trim().toUpperCase(),item.amount]);

export function validateFuelRecovery(payload){
 if(payload?.format!=='artbec-fuel-sheet-recovery-v1'||payload.source?.sheet!=='Controle Gasolina.2026'||payload.source?.through!=='2026-10-29'||!/^[a-f0-9]{64}$/.test(payload.source?.sha256??'')||payload.fuel?.length!==38)throw new Error('Pacote de gasolina inválido');
 const ids=new Set(),days=new Set(),counts={};
 for(const item of payload.fuel){
  const parsed=new Date(item.date+'T12:00:00Z');
  if(!/^fuel-import-20261029-[a-f0-9]{24}$/.test(item.id)||ids.has(item.id)||!['Vasco','Esdras','Genilson','Nicolas','Kevin'].includes(item.technician)
   ||!/^2026-(09|10)-\d{2}$/.test(item.date)||item.date>payload.source.through||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==item.date
   ||!Number.isSafeInteger(item.amount)||item.amount<=0||item.amount>100000000||!/^[A-Z0-9-]{0,10}$/.test(item.plate)||item.source!==payload.source.sheet||!Number.isInteger(item.sourceRow)||item.sourceRow<11||item.sourceRow>562||item.version!==1||days.has(dayKey(item)))throw new Error('Lançamento fora do escopo da recuperação de gasolina');
  ids.add(item.id);days.add(dayKey(item));counts[item.date.slice(0,7)]=(counts[item.date.slice(0,7)]??0)+1;
 }
 if(counts['2026-09']!==12||counts['2026-10']!==26)throw new Error('Contagens da planilha de gasolina divergentes');
}

// Row numbers changed in the newer XLSX: compare actual fuel content, not old
// sourceRow-based IDs. Keep all prior edits/deletions and never recreate staff.
export async function recoverFuelSheet({db,payload,baseFuel,now=new Date().toISOString()}){
 validateFuelRecovery(payload);
 await db.prepare('CREATE TABLE IF NOT EXISTS _artbec_data_repairs (id TEXT PRIMARY KEY, details TEXT NOT NULL, completed_at TEXT NOT NULL)').run();
 if(await db.prepare('SELECT id FROM _artbec_data_repairs WHERE id=?').bind(fuelRepairId).first()){
  console.log('Gasolina da planilha já recuperada; alterações posteriores preservadas.');return {skipped:true};
 }
 const saved=(await db.prepare('SELECT id,entity,data,version,deleted FROM operation_changes').all()).results;
 const deletionHistory=(await db.prepare("SELECT record_id,before_data FROM audit_events WHERE source_table='operation_changes' AND entity='fuel' AND action='deleted' ORDER BY sequence DESC").all()).results;
 const deletedBefore=new Map();for(const row of deletionHistory)if(!deletedBefore.has(row.record_id)&&row.before_data)deletedBefore.set(row.record_id,JSON.parse(row.before_data));
 const deletedManualDays=new Set();
 const protectedIds=new Set(saved.map(row=>row.id)),effective=new Map(baseFuel.map(item=>[item.id,item])),deletedKeys=new Set(),persisted=[];
 for(const row of saved){
  if(row.entity!=='fuel')continue;
  const previous=effective.get(row.id),data=JSON.parse(row.data||'{}');
  if(row.deleted){const original=previous??(typeof data.technician==='string'?data:deletedBefore.get(row.id));if(typeof original?.technician==='string'&&typeof original?.date==='string'){deletedKeys.add(recordKey(original));if(original.source==='Cadastro no site')deletedManualDays.add(dayKey(original));}effective.delete(row.id);continue;}
  const item={...previous,...data,id:row.id,version:row.version};effective.set(row.id,item);persisted.push(item);
 }
 const keys=new Set([...effective.values()].map(recordKey));
 const missing=[],preserved=[];
 for(const item of payload.fuel){
  if(protectedIds.has(item.id)||keys.has(recordKey(item))||deletedKeys.has(recordKey(item))||deletedManualDays.has(dayKey(item))){preserved.push({id:item.id,reason:'existing-or-deleted'});continue;}
  // A manually saved expense for this person/day wins even if its plate or a
  // cent differs. Preserve it for review instead of duplicating/correcting it.
  const sameDay=persisted.filter(current=>dayKey(current)===dayKey(item));
  if(sameDay.length){preserved.push({id:item.id,reason:'existing-person-day',existing:sameDay});continue;}
  missing.push(item);
 }
 const statements=[db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name').bind('system:'+fuelRepairId,'Recuperação da gasolina da planilha')];
 for(const item of missing)statements.push(db.prepare("INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'fuel',?,1,0,?)").bind(item.id,JSON.stringify(item),now));
 const details={source:payload.source,insertedIds:missing.map(item=>item.id),preserved,excluded:payload.excluded};
 statements.push(db.prepare('INSERT INTO _artbec_data_repairs (id,details,completed_at) VALUES (?,?,?)').bind(fuelRepairId,JSON.stringify(details),now));
 statements.push(db.prepare('DELETE FROM audit_context WHERE id=1'));
 await db.batch(statements);
 console.log(`Gasolina recuperada: ${missing.length} lançamentos incluídos; ${preserved.length} cadastros existentes preservados. Nenhuma edição, exclusão ou outra área alterada.`);
 return {skipped:false,inserted:missing.length,preserved:preserved.length};
}

async function main(){
 const raw=await readFile('/app/migration/fuel-recovery-2026-10-29.json','utf8');
 if(createHash('sha256').update(raw).digest('hex')!==fuelPayloadHash)throw new Error('Checksum da recuperação de gasolina inválido');
 const config=JSON.parse(await readFile('/app/dist/server/wrangler.docker.json','utf8'));
 const source=JSON.parse(await readFile('/app/data/operations.json','utf8'));
 const mf=migrationRuntime(config,'/app/.wrangler/state');
 try{await recoverFuelSheet({db:await mf.getD1Database('DB'),payload:JSON.parse(raw),baseFuel:source.fuel});}finally{await mf.dispose();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
