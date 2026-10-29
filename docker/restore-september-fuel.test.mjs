import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {recoverFuelSheet} from './recover-fuel-sheet.mjs';
import {restoreSeptemberFuel,septemberRepairId,septemberPayloadHash,validateSeptemberFuelRestore} from './restore-september-fuel.mjs';
const payload=JSON.parse(await readFile('migration/fuel-september-restore-2026.json','utf8'));
const first=JSON.parse(await readFile('migration/fuel-recovery-2026-10-29.json','utf8'));
const base=JSON.parse(await readFile('migration/initial/base/operations.json','utf8'));
const options={modules:true,script:'',d1Databases:['DB']};
const snapshot=async(db,table='operation_changes')=>(await db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()).results;
async function setup(db){
 const dump=JSON.parse(await readFile('migration/initial/database/database.json','utf8')),statements=[];
 for(const [name,table] of Object.entries(dump.tables)){statements.push(db.prepare(table.schema));for(const row of table.rows){const keys=Object.keys(row);statements.push(db.prepare(`INSERT INTO "${name}" (${keys.map(key=>'"'+key+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>Array.isArray(row[key])?new Uint8Array(row[key]):row[key])));}}
 for(const object of dump.objects)if(object.sql)statements.push(db.prepare(object.sql));await db.batch(statements);
 await recoverFuelSheet({db,payload:first,baseFuel:base.fuel});return dump;
}
function merge(rows){const map=new Map(base.fuel.map(item=>[item.id,item]));for(const row of rows.filter(row=>row.entity==='fuel')){if(row.deleted)map.delete(row.id);else map.set(row.id,{...map.get(row.id),...JSON.parse(row.data)});}return [...map.values()];}

test('export real: restaura 13 exclusões de setembro sem duplicar manual, mantém outubro e persiste edições posteriores',async()=>{
 const state=await mkdtemp(join(tmpdir(),'artbec-september-fuel-'));let mf=new Miniflare({...options,d1Persist:state});
 try{
  let db=await mf.getD1Database('DB');const dump=await setup(db),before=await snapshot(db),others={};
  for(const name of Object.keys(dump.tables).filter(name=>!['operation_changes','audit_context','audit_events','audit_originals'].includes(name)))others[name]=await snapshot(db,name);
  const october=merge(before).filter(item=>item.date.startsWith('2026-10'));
  assert.deepEqual(await restoreSeptemberFuel({db,payload,baseFuel:base.fuel,now:'2026-10-29T18:00:00Z'}),{skipped:false,restored:13,preserved:1});
  const after=await snapshot(db);assert.equal(after.length,before.length);
  const changed=after.filter(row=>JSON.stringify(before.find(item=>item.id===row.id))!==JSON.stringify(row));assert.equal(changed.length,13);
  for(const row of changed){const old=before.find(item=>item.id===row.id),item=JSON.parse(row.data),original=payload.targets.find(target=>target.record.id===row.id).record;assert.equal(old.deleted,1);assert.equal(row.deleted,0);assert.equal(row.version,old.version+1);assert.deepEqual(item,{...original,version:row.version});assert.ok(item.date.startsWith('2026-09'));}
  for(const row of before.filter(row=>!changed.some(item=>item.id===row.id)))assert.deepEqual(after.find(item=>item.id===row.id),row);
  for(const [name,rows] of Object.entries(others))assert.deepEqual(await snapshot(db,name),rows,name);
  assert.deepEqual(merge(after).filter(item=>item.date.startsWith('2026-10')),october);
  const september=merge(after).filter(item=>item.date.startsWith('2026-09')&&Object.hasOwn(payload.expectedCurrent,item.technician));assert.equal(september.length,26);assert.equal(september.reduce((sum,item)=>sum+item.amount,0),127817);
  for(const [owner,expected] of Object.entries(payload.expectedCurrent)){const rows=september.filter(item=>item.technician===owner);assert.equal(rows.length,expected.count);assert.equal(rows.reduce((sum,item)=>sum+item.amount,0),expected.amount);}
  const manual=september.filter(item=>item.technician==='Esdras'&&item.date==='2026-09-01');assert.equal(manual.length,1);assert.equal(manual[0].plate,'FCC7G74');assert.equal(after.find(row=>row.id==='fuel-controle-gasolina-2026-209').deleted,1);
  const audit=(await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:'+septemberRepairId).all()).results;assert.equal(audit.length,13);assert.ok(audit.every(row=>row.entity==='fuel'&&row.action==='restored'));
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  const marker=JSON.parse(await db.prepare('SELECT details FROM _artbec_data_repairs WHERE id=?').bind(septemberRepairId).first('details'));assert.equal(marker.before.length,13);assert.equal(marker.preserved.length,1);
  await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.amount',7000),version=version+1 WHERE id=?").bind(changed[0].id).run();await db.prepare("UPDATE operation_changes SET deleted=1,data='{}',version=version+1 WHERE id=?").bind(changed[1].id).run();
  const edited=await snapshot(db),auditEdited=await snapshot(db,'audit_events');await mf.dispose();mf=new Miniflare({...options,d1Persist:state});db=await mf.getD1Database('DB');
  assert.deepEqual(await restoreSeptemberFuel({db,payload,baseFuel:base.fuel}),{skipped:true});assert.deepEqual(await snapshot(db),edited);assert.deepEqual(await snapshot(db,'audit_events'),auditEdited);
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
});

test('exclusões recentes, valores já corrigidos e duplicatas manuais são preservados; falha reverte tudo',async()=>{
 const mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('DB');await setup(db);
  await db.prepare("UPDATE operation_changes SET version=7,updated_at='2026-10-29T17:00:00Z' WHERE id='fuel-controle-gasolina-2026-210'").run();
  const edited={...base.fuel.find(item=>item.id==='fuel-controle-gasolina-2026-211'),amount:9999,version:7};await db.prepare("UPDATE operation_changes SET data=?,deleted=0,version=7,updated_at='later' WHERE id=?").bind(JSON.stringify(edited),edited.id).run();
  const duplicate={...base.fuel.find(item=>item.id==='fuel-controle-gasolina-2026-212'),id:'fuel-september-manual',amount:7000,version:1,source:'Cadastro no site'};await db.prepare("INSERT INTO operation_changes VALUES(?,'fuel',?,1,0,'manual')").bind(duplicate.id,JSON.stringify(duplicate)).run();
  const before=await snapshot(db),auditBefore=await snapshot(db,'audit_events');
  await db.prepare("CREATE TRIGGER fail_september BEFORE UPDATE ON operation_changes WHEN NEW.id='fuel-controle-gasolina-2026-250' BEGIN SELECT RAISE(ABORT,'forced rollback'); END").run();
  await assert.rejects(restoreSeptemberFuel({db,payload,baseFuel:base.fuel}),/forced rollback/);assert.deepEqual(await snapshot(db),before);assert.deepEqual(await snapshot(db,'audit_events'),auditBefore);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs WHERE id=?').bind(septemberRepairId).first('n'),0);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  await db.prepare('DROP TRIGGER fail_september').run();assert.deepEqual(await restoreSeptemberFuel({db,payload,baseFuel:base.fuel}),{skipped:false,restored:10,preserved:4});
  const after=await snapshot(db);for(const id of ['fuel-controle-gasolina-2026-210','fuel-controle-gasolina-2026-211','fuel-controle-gasolina-2026-212',duplicate.id])assert.deepEqual(after.find(row=>row.id===id),before.find(row=>row.id===id));
 }finally{await mf.dispose();}
});

test('pacote confere checksum e valores da base original, restringe setembro e roda depois da importação anterior',async()=>{
 validateSeptemberFuelRestore(payload,base.fuel);assert.equal(createHash('sha256').update(await readFile('migration/fuel-september-restore-2026.json')).digest('hex'),septemberPayloadHash);
 for(const update of [{date:'2026-10-01'},{amount:1},{technician:'Simão'},{source:'Gasolina. 2025'}]){const invalid=structuredClone(payload);Object.assign(invalid.targets[0].record,update);assert.throws(()=>validateSeptemberFuelRestore(invalid,base.fuel));}
 const script=await readFile('docker/entrypoint.sh','utf8');assert.ok(script.indexOf('recover-fuel-sheet.mjs')<script.indexOf('restore-september-fuel.mjs'));assert.ok(script.indexOf('restore-september-fuel.mjs')<script.indexOf('exec node'));
});
