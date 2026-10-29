import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {recoverOil2026,oilRepairId,oilPayloadHash,validateOilRecovery} from './recover-oil-2026.mjs';
import {kmStatus,updateOilMonitor,monitorSetup,oilLedgerEntry} from '../lib/oil-monitor.ts';
const payload=JSON.parse(await readFile('migration/oil-recovery-2026-10-29.json','utf8'));
const base=JSON.parse(await readFile('migration/initial/base/operations.json','utf8'));
const options={modules:true,script:'',d1Databases:['DB']};
const snapshot=async(db,table='operation_changes')=>(await db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()).results;
async function setup(db){
 const dump=JSON.parse(await readFile('migration/initial/database/database.json','utf8')),sql=[];
 for(const [name,table] of Object.entries(dump.tables)){sql.push(db.prepare(table.schema));for(const row of table.rows){const keys=Object.keys(row);sql.push(db.prepare(`INSERT INTO "${name}" (${keys.map(key=>'"'+key+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>Array.isArray(row[key])?new Uint8Array(row[key]):row[key])));}}
 for(const object of dump.objects)if(object.sql)sql.push(db.prepare(object.sql));await db.batch(sql);return dump;
}
function oil(rows){const map=new Map(base.oil.map(item=>[item.id,item]));for(const row of rows.filter(row=>row.entity==='oil')){if(row.deleted)map.delete(row.id);else map.set(row.id,{...map.get(row.id),...JSON.parse(row.data),version:row.version});}return [...map.values()];}

test('export real: completa óleo 2026, integra cinco motos à fórmula e preserva tudo após reinício',async()=>{
 const state=await mkdtemp(join(tmpdir(),'artbec-oil-import-'));let mf=new Miniflare({...options,d1Persist:state});
 try{
  let db=await mf.getD1Database('DB');const dump=await setup(db),before=await snapshot(db),others={};
  for(const name of Object.keys(dump.tables).filter(name=>!['operation_changes','audit_context','audit_events','audit_originals'].includes(name)))others[name]=await snapshot(db,name);
  assert.deepEqual(await recoverOil2026({db,payload,baseOil:base.oil,now:'2026-10-29T19:00:00Z'}),{skipped:false,inserted:19,restored:4,monitors:5});
  const after=await snapshot(db),ledger=oil(after),october=ledger.filter(item=>item.date.startsWith('2026-10'));
  assert.equal(after.length-before.length,23);assert.equal(ledger.filter(item=>item.date.startsWith('2026-09')).length,17);assert.equal(october.length,15);assert.equal(october.reduce((sum,item)=>sum+(item.amount??0),0),23800);
  assert.equal(ledger.filter(item=>item.technician==='Esdras'&&item.date==='2026-10-01').length,1);assert.equal(ledger.filter(item=>item.technician==='Kevin'&&item.date==='2026-09-14').length,1);assert.equal(ledger.filter(item=>item.technician==='Genilson'&&item.date==='2026-09-14').length,1);
  assert.equal(ledger.some(item=>item.technician==='Vasco'&&item.date==='2026-09-28'),false);
  assert.deepEqual(ledger.filter(item=>item.date.startsWith('2025-')),oil(before).filter(item=>item.date.startsWith('2025-')));
  const restoredIds=new Set(payload.targets.filter(target=>target.expectedDeleted).map(target=>target.record.id));
  const oldMonitor=payload.monitors.find(target=>target.expectedExisting).expectedExisting;
  for(const row of before.filter(row=>!restoredIds.has(row.id)&&row.id!==oldMonitor.id))assert.deepEqual(after.find(item=>item.id===row.id),row);
  for(const [name,rows] of Object.entries(others))assert.deepEqual(await snapshot(db,name),rows,name);
  const monitors=after.filter(row=>row.entity==='oilMonitor'&&!row.deleted).map(row=>({...JSON.parse(row.data),version:row.version}));assert.equal(monitors.length,5);assert.equal(new Set(monitors.map(m=>m.plate)).size,5);
  const expected={Esdras:[261903,701],Vasco:[59912,385],Genilson:[178737,502],Kevin:[79230,397],Nicolas:[125094,1000]};
  for(const m of monitors){assert.equal(monitorSetup.safeParse(m).success,true,m.technician);assert.deepEqual([kmStatus(m.currentKm,m.oilKm,1000).next,kmStatus(m.currentKm,m.oilKm,1000).remaining],expected[m.technician]);assert.equal(kmStatus(m.currentKm,m.serviceKm,5000).state,'unknown');assert.equal(m.importReference.approximate,true);const read=updateOilMonitor(m,'reading',m.currentKm+1000,'2026-10-29','now');assert.equal(kmStatus(read.currentKm,read.oilKm,1000).state,'due');const changed=updateOilMonitor(read,'oil',read.currentKm,'2026-10-29','now');assert.equal(kmStatus(changed.currentKm,changed.oilKm,1000).remaining,1000);assert.equal(changed.serviceKm,null);}
  const nicolas=monitors.find(m=>m.technician==='Nicolas');assert.equal(nicolas.importReference.currentReadingDate,'2026-10-20');assert.equal(nicolas.oilDate,'2026-10-21');assert.ok(nicolas.history.some(event=>event.date==='2026-10-20'&&event.km===124094));
  const esdras=monitors.find(m=>m.technician==='Esdras');assert.equal(esdras.id,oldMonitor.id);assert.ok(esdras.history.some(event=>event.event==='setup'));assert.ok(esdras.oilRequests.every(request=>request.completedDate));
  const imported=october.filter(item=>item.source==='Controle Óleo 26');const daily=imported.find(item=>item.technician==='Esdras'&&item.date==='2026-10-27');const hex=createHash('sha256').update('FUA2E40:2026-10-27').digest('hex').slice(0,32);assert.equal(daily.id,'oil-'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'));const updatedDaily=oilLedgerEntry({...esdras,currentKm:261300},daily.id,daily);assert.equal(updatedDaily.id,daily.id);assert.equal(updatedDaily.version,daily.version+1);assert.equal(updatedDaily.amount,null);assert.ok(imported.some(item=>item.amount===null&&item.entryType==='reading'));assert.ok(imported.some(item=>item.technician==='Vasco'&&item.amount===null&&item.entryType==='oil'));
  const audit=(await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:'+oilRepairId).all()).results;assert.equal(audit.length,28);assert.equal(audit.filter(event=>event.action==='restored').length,4);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  const edited=imported[0];await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.amount',9999),version=version+1 WHERE id=?").bind(edited.id).run();await db.prepare("UPDATE operation_changes SET deleted=1,version=version+1 WHERE id=?").bind(nicolas.id).run();const saved=await snapshot(db),savedAudit=await snapshot(db,'audit_events');
  await mf.dispose();mf=new Miniflare({...options,d1Persist:state});db=await mf.getD1Database('DB');assert.deepEqual(await recoverOil2026({db,payload,baseOil:base.oil}),{skipped:true});assert.deepEqual(await snapshot(db),saved);assert.deepEqual(await snapshot(db,'audit_events'),savedAudit);
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
});

test('manuals, newer deletions, changed cards and archives win; failure rolls back ledger, monitors and audit',async()=>{
 const mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('DB');await setup(db);
  const target=payload.targets.find(target=>target.record.technician==='Esdras'&&target.record.date==='2026-10-27').record;
  const manual={...target,id:'oil-new-manual',amount:7777,version:1,source:'Cadastro no site'};await db.prepare("INSERT INTO operation_changes VALUES(?,'oil',?,1,0,'new')").bind(manual.id,JSON.stringify(manual)).run();
  const deleted=payload.targets.find(target=>target.expectedDeleted).record;await db.prepare("UPDATE operation_changes SET version=9,updated_at='new' WHERE id=?").bind(deleted.id).run();
  const monitor=payload.monitors.find(target=>target.expectedExisting).expectedExisting;await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.currentKm',300000),version=version+1 WHERE id=?").bind(monitor.id).run();
  const archived=payload.existingSnapshot.find(row=>row.entity==='oilMonitor'&&JSON.parse(row.data).plate==='GIM5J14');await db.prepare("UPDATE operation_changes SET version=9,updated_at='new' WHERE id=?").bind(archived.id).run();
  const before=await snapshot(db),auditBefore=await snapshot(db,'audit_events');await db.prepare("CREATE TRIGGER fail_oil_import BEFORE INSERT ON operation_changes WHEN NEW.entity='oilMonitor' BEGIN SELECT RAISE(ABORT,'forced oil rollback'); END").run();
  await assert.rejects(recoverOil2026({db,payload,baseOil:base.oil}),/forced oil rollback/);assert.deepEqual(await snapshot(db),before);assert.deepEqual(await snapshot(db,'audit_events'),auditBefore);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs').first('n'),0);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  await db.prepare('DROP TRIGGER fail_oil_import').run();assert.deepEqual(await recoverOil2026({db,payload,baseOil:base.oil}),{skipped:false,inserted:18,restored:3,monitors:3});const after=await snapshot(db);
  for(const id of [manual.id,deleted.id,monitor.id,archived.id])assert.deepEqual(after.find(row=>row.id===id),before.find(row=>row.id===id));assert.equal(oil(after).filter(item=>item.technician===target.technician&&item.date===target.date).length,1);
 }finally{await mf.dispose();}
});

test('package checksum, scope and startup order',async()=>{
 validateOilRecovery(payload);assert.equal(createHash('sha256').update(await readFile('migration/oil-recovery-2026-10-29.json')).digest('hex'),oilPayloadHash);
 for(const update of [{date:'2025-10-01'},{date:'2026-11-01'},{amount:NaN},{odometer:-1}]){const bad=structuredClone(payload);Object.assign(bad.targets[0].record,update);assert.throws(()=>validateOilRecovery(bad));}
 const script=await readFile('docker/entrypoint.sh','utf8');assert.ok(script.indexOf('import-initial-data.mjs')<script.indexOf('recover-oil-2026.mjs'));assert.ok(script.indexOf('recover-oil-2026.mjs')<script.indexOf('exec node'));
});
