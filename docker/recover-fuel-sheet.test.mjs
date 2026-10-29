import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {recoverFuelSheet,fuelRepairId,fuelPayloadHash,validateFuelRecovery} from './recover-fuel-sheet.mjs';
const payload=JSON.parse(await readFile('migration/fuel-recovery-2026-10-29.json','utf8'));
const base=JSON.parse(await readFile('migration/initial/base/operations.json','utf8'));
const options={modules:true,script:'',d1Databases:['DB']};
const snapshot=async(db,table='operation_changes')=>(await db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()).results;
async function loadExport(db){
 const dump=JSON.parse(await readFile('migration/initial/database/database.json','utf8')),statements=[];
 for(const [name,table] of Object.entries(dump.tables)){
  statements.push(db.prepare(table.schema));
  for(const row of table.rows){const keys=Object.keys(row);statements.push(db.prepare(`INSERT INTO "${name}" (${keys.map(key=>'"'+key+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>Array.isArray(row[key])?new Uint8Array(row[key]):row[key])));}
 }
 for(const object of dump.objects)if(object.sql)statements.push(db.prepare(object.sql));await db.batch(statements);return dump;
}
function merged(rows){const map=new Map(base.fuel.map(item=>[item.id,item]));for(const row of rows.filter(row=>row.entity==='fuel')){if(row.deleted)map.delete(row.id);else map.set(row.id,{...map.get(row.id),...JSON.parse(row.data)});}return [...map.values()];}

test('export real: importa 35 abastecimentos, preserva três manuais, edições, placas, centavos e reinício',async()=>{
 const state=await mkdtemp(join(tmpdir(),'artbec-fuel-recovery-'));let mf=new Miniflare({...options,d1Persist:state});
 try{
  let db=await mf.getD1Database('DB');const dump=await loadExport(db);
  const before=await snapshot(db),other={};for(const name of Object.keys(dump.tables).filter(name=>!['operation_changes','audit_events','audit_context'].includes(name)))other[name]=await snapshot(db,name);
  const baseCopy=structuredClone(base);
  assert.deepEqual(await recoverFuelSheet({db,payload,baseFuel:base.fuel,now:'2026-10-29T15:00:00Z'}),{skipped:false,inserted:35,preserved:3});
  const after=await snapshot(db);assert.equal(after.length,before.length+35);
  for(const row of before)assert.deepEqual(after.find(item=>item.id===row.id),row,row.id);
  for(const [name,rows] of Object.entries(other))assert.deepEqual(await snapshot(db,name),rows,name);
  assert.deepEqual(base,baseCopy);
  const inserted=after.filter(row=>!before.some(previous=>previous.id===row.id));assert.ok(inserted.every(row=>row.entity==='fuel'&&row.version===1&&!row.deleted));
  assert.equal(inserted.reduce((sum,row)=>sum+JSON.parse(row.data).amount,0),173671);
  assert.equal(inserted.filter(row=>JSON.parse(row.data).date.startsWith('2026-09')).length,12);
  assert.equal(inserted.filter(row=>JSON.parse(row.data).date.startsWith('2026-10')).length,23);
  const fuel=merged(after),october=fuel.filter(item=>item.date.startsWith('2026-10')&&['Vasco','Esdras','Genilson','Nicolas','Kevin'].includes(item.technician));
  assert.equal(october.length,27);assert.equal(october.reduce((sum,item)=>sum+item.amount,0),133669);
  for(const [name,count,total] of [['Vasco',6,30000],['Esdras',8,38669],['Genilson',5,25000],['Nicolas',8,40000]]){const rows=october.filter(item=>item.technician===name);assert.equal(rows.length,count);assert.equal(rows.reduce((sum,item)=>sum+item.amount,0),total);}
  const vasco=october.find(item=>item.technician==='Vasco'&&item.date==='2026-10-03');assert.equal(vasco.amount,5000);assert.equal(vasco.plate,'FCC7G74');
  const genilson=october.find(item=>item.technician==='Genilson'&&item.date==='2026-10-05');assert.equal(genilson.plate,'GDM8147');
  assert.equal(fuel.find(item=>item.technician==='Vasco'&&item.date==='2026-09-27').amount,5002);
  assert.equal(fuel.find(item=>item.technician==='Esdras'&&item.date==='2026-10-06').amount,3657);
  const audit=(await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:'+fuelRepairId).all()).results;assert.equal(audit.length,35);assert.ok(audit.every(row=>row.action==='created'&&row.entity==='fuel'));
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  const details=JSON.parse(await db.prepare('SELECT details FROM _artbec_data_repairs WHERE id=?').bind(fuelRepairId).first('details'));assert.equal(details.insertedIds.length,35);assert.equal(details.preserved.length,3);assert.equal(details.excluded[0].rawDate,'02/10/-2026');
  await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.amount',9000),version=2 WHERE id=?").bind(inserted[0].id).run();
  await db.prepare("UPDATE operation_changes SET data='{}',deleted=1,version=2 WHERE id=?").bind(inserted[1].id).run();
  const manual=await snapshot(db),auditManual=await snapshot(db,'audit_events');await mf.dispose();mf=new Miniflare({...options,d1Persist:state});db=await mf.getD1Database('DB');
  assert.deepEqual(await recoverFuelSheet({db,payload,baseFuel:base.fuel}),{skipped:true});assert.deepEqual(await snapshot(db),manual);assert.deepEqual(await snapshot(db,'audit_events'),auditManual);
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
});

test('falha reverte lote e auditoria; exclusões por ID e por histórico manual não são recriadas',async()=>{
 const mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('DB');await loadExport(db);
  const first=payload.fuel[0],second=payload.fuel[1];
  await db.prepare('INSERT INTO operation_changes VALUES(?,?,?,?,1,?)').bind(first.id,'fuel','{}',4,'before').run();
  const deletedManual={...second,id:'fuel-deleted-manual',source:'Cadastro no site',sourceRow:0,plate:'DIFERENTE',amount:7000};
  await db.prepare('INSERT INTO operation_changes VALUES(?,?,?,?,0,?)').bind(deletedManual.id,'fuel',JSON.stringify(deletedManual),1,'before').run();
  await db.prepare("UPDATE operation_changes SET data='{}',deleted=1,version=2 WHERE id=?").bind(deletedManual.id).run();
  const before=await snapshot(db),auditBefore=await snapshot(db,'audit_events');
  await db.prepare(`CREATE TRIGGER fail_fuel BEFORE INSERT ON operation_changes WHEN NEW.id='${payload.fuel[4].id}' BEGIN SELECT RAISE(ABORT,'forced rollback'); END`).run();
  await assert.rejects(recoverFuelSheet({db,payload,baseFuel:base.fuel}),/forced rollback/);assert.deepEqual(await snapshot(db),before);assert.deepEqual(await snapshot(db,'audit_events'),auditBefore);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs').first('n'),0);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  await db.prepare('DROP TRIGGER fail_fuel').run();
  assert.deepEqual(await recoverFuelSheet({db,payload,baseFuel:base.fuel}),{skipped:false,inserted:33,preserved:5});
  const after=await snapshot(db);assert.equal(after.some(row=>row.id===second.id),false);for(const row of before)assert.deepEqual(after.find(item=>item.id===row.id),row);
 }finally{await mf.dispose();}
});

test('pacote tem origem e checksum, datas reais, valores em centavos e startup após a importação inicial',async()=>{
 validateFuelRecovery(payload);assert.equal(createHash('sha256').update(await readFile('migration/fuel-recovery-2026-10-29.json')).digest('hex'),fuelPayloadHash);
 assert.equal(payload.compared.existingRows,293);assert.equal(payload.excluded.length,1);
 for(const change of [{date:'2026-11-01'},{date:'2026-09-31'},{amount:null},{amount:0},{technician:'Simão'},{source:'Gasolina. 2025'}]){const invalid=structuredClone(payload);Object.assign(invalid.fuel[0],change);assert.throws(()=>validateFuelRecovery(invalid));}
 const script=await readFile('docker/entrypoint.sh','utf8');assert.ok(script.indexOf('import-initial-data.mjs')<script.indexOf('recover-fuel-sheet.mjs'));assert.ok(script.indexOf('recover-fuel-sheet.mjs')<script.indexOf('exec node'));
});
