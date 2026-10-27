import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {recoverVitaHistory} from './recover-vita-history.mjs';
import {priceVitaHistory,priceRepairId,pricePayloadHash,validateVitaHistoryPrices} from './price-vita-history.mjs';

const history=JSON.parse(await readFile('migration/vita-history-2026-04-08.json','utf8'));
const prices=JSON.parse(await readFile('migration/vita-history-prices-2026-04-08.json','utf8'));
const base=JSON.parse(await readFile('migration/initial/base/operations.json','utf8'));
const options={modules:true,script:'',d1Databases:['DB']};
const snapshot=async(db,table='operation_changes')=>(await db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()).results;
async function setup(db){
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await db.batch((await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
 await recoverVitaHistory({db,payload:history,baseSales:base.sales});
}

test('preenche 49 valores e seus itens, deixa quatro tratamentos sem preço e preserva outubro, estoque, histórico e reinícios',async()=>{
 const state=await mkdtemp(join(tmpdir(),'artbec-vita-prices-'));let mf=new Miniflare({...options,d1Persist:state});
 try{
  let db=await mf.getD1Database('DB');await setup(db);
  for(const [id,entity,data] of [['sale-october','sale',{period:'2026-10',total:20280,client:'Vita Higienópolis',stockItems:[{productId:'stock-current',quantity:2}]}],['stock-current','stock',{initial:40,incoming:8,outgoing:3}],['stockMovement-current','stockMovement',{quantity:5}]])await db.prepare('INSERT INTO operation_changes VALUES(?,?,?,?,0,?)').bind(id,entity,JSON.stringify(data),7,'before').run();
  const before=await snapshot(db);const sourceCopy=structuredClone(base);
  assert.deepEqual(await priceVitaHistory({db,prices,history,now:'2026-10-27T12:00:00Z'}),{skipped:false,updated:49,preserved:0});
  const after=await snapshot(db);assert.equal(after.length,before.length);
  const targets=new Set(prices.rows.map(row=>row.id));
  for(const row of before.filter(row=>!targets.has(row.id)))assert.deepEqual(after.find(item=>item.id===row.id),row);
  for(const target of prices.rows){
   const row=after.find(row=>row.id===target.id),item=JSON.parse(row.data),original=JSON.parse(before.find(row=>row.id===target.id).data);
   assert.equal(row.version,2);assert.equal(item.version,2);assert.equal(item.total,target.total);assert.deepEqual(item.lineItems,target.lineItems);
   for(const key of Object.keys(original).filter(key=>!['version','total','quantity','unitPrice','lineItems'].includes(key)))assert.deepEqual(item[key],original[key],target.id+':'+key);
  }
  assert.deepEqual(base,sourceCopy);
  assert.equal(prices.rows.filter(row=>row.lineItems.some(line=>line.unitPrice===null)).length,4);
  assert.ok(prices.rows.flatMap(row=>row.lineItems).filter(line=>line.unitPrice===null).every(line=>line.product==='Tratamento Semanal'));
  assert.ok(prices.rows.flatMap(row=>row.lineItems).every(line=>line.unitPrice!==0));
  const expected={'2026-04 Vita Morumbi':92700,'2026-04 Vita Higienópolis':189000,'2026-05 Vita Morumbi':140000,'2026-05 Vita Higienópolis':152000,'2026-06 Vita Morumbi':54000,'2026-06 Vita Higienópolis':114000,'2026-07 Vita Morumbi':96000,'2026-07 Vita Higienópolis':166700,'2026-08 Vita Morumbi':64000,'2026-08 Vita Higienópolis':153300};
  for(const [key,total] of Object.entries(expected))assert.equal(after.filter(row=>targets.has(row.id)).map(row=>JSON.parse(row.data)).filter(item=>item.period+' '+item.client===key).reduce((sum,item)=>sum+item.total,0),total,key);
  const audit=(await db.prepare('SELECT * FROM audit_events WHERE actor_id=?').bind('system:'+priceRepairId).all()).results;
  assert.equal(audit.length,49);assert.ok(audit.every(row=>row.action==='updated'&&JSON.parse(row.before_data).total===null));
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  await db.prepare("UPDATE operation_changes SET data=json_set(data,'$.total',NULL),version=3 WHERE id=?").bind(prices.rows[0].id).run();
  const manual=await snapshot(db),manualAudit=await snapshot(db,'audit_events');await mf.dispose();mf=new Miniflare({...options,d1Persist:state});db=await mf.getD1Database('DB');
  assert.deepEqual(await priceVitaHistory({db,prices,history}),{skipped:true});assert.deepEqual(await snapshot(db),manual);assert.deepEqual(await snapshot(db,'audit_events'),manualAudit);
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
});

test('edições, valores preenchidos, exclusões e entregas movidas para outubro são preservados; falha reverte tudo',async()=>{
 const mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('DB');await setup(db);
  const modify=async(index,sql)=>db.prepare('UPDATE operation_changes SET '+sql+',version=7 WHERE id=?').bind(prices.rows[index].id).run();
  await modify(0,"data=json_set(data,'$.total',8000)");
  await modify(1,"data=json_set(data,'$.product','Produto corrigido manualmente')");
  await modify(2,"data=json_set(data,'$.lineItems',json('[{\"product\":\"Manual\",\"quantity\":1,\"unitPrice\":null}]'))");
  await modify(3,"data=json_set(data,'$.deliveryDate','2026-10-15')");
  await modify(4,"deleted=1,data='{}'");
  await modify(5,"entity='stock'");
  await modify(6,"data=json_set(data,'$.unitPrice',4000)");
  await modify(7,"data=json_set(data,'$.status','paid')");
  const before=await snapshot(db),beforeAudit=await snapshot(db,'audit_events');
  await db.prepare(`CREATE TRIGGER fail_prices BEFORE UPDATE ON operation_changes WHEN NEW.id='${prices.rows[10].id}' BEGIN SELECT RAISE(ABORT,'forced rollback'); END`).run();
  await assert.rejects(priceVitaHistory({db,prices,history}),/forced rollback/);
  assert.deepEqual(await snapshot(db),before);assert.deepEqual(await snapshot(db,'audit_events'),beforeAudit);assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM _artbec_data_repairs WHERE id=?').bind(priceRepairId).first('n'),0);
  await db.prepare('DROP TRIGGER fail_prices').run();
  assert.deepEqual(await priceVitaHistory({db,prices,history}),{skipped:false,updated:42,preserved:7});
  const after=await snapshot(db);for(const target of prices.rows.slice(0,7))assert.deepEqual(after.find(row=>row.id===target.id),before.find(row=>row.id===target.id));
  const paid=JSON.parse(after.find(row=>row.id===prices.rows[7].id).data);assert.equal(paid.status,'paid');assert.equal(paid.total,prices.rows[7].total);
 }finally{await mf.dispose();}
});

test('origem, totais, exclusão do preço de julho e ordem de startup são conferidos',async()=>{
 validateVitaHistoryPrices(prices,history);
 assert.equal(createHash('sha256').update(await readFile('migration/vita-history-prices-2026-04-08.json')).digest('hex'),pricePayloadHash);
 assert.ok(prices.rows.every(row=>row.id!=='sale-v-julho-vita-21'));assert.equal(base.sales.find(item=>item.id==='sale-v-julho-vita-21').total,38000);
 for(const change of [row=>row.total++,row=>row.id='sale-october',row=>row.lineItems[0].unitPrice=null,row=>row.lineItems[0].quantity=0]){const invalid=structuredClone(prices);change(invalid.rows[0]);assert.throws(()=>validateVitaHistoryPrices(invalid,history));}
 const hose=prices.rows.find(row=>row.id==='sale-v-agosto-vita-32');assert.equal(hose.total,17800);assert.deepEqual(hose.lineItems.map(line=>line.quantity),[7,3]);
 const first=prices.rows.find(row=>row.id==='sale-v-abr-vita-13');assert.equal(first.total,31200);assert.deepEqual(first.lineItems.map(line=>line.quantity),[2,1,1,2,1]);
 const script=await readFile('docker/entrypoint.sh','utf8');assert.ok(script.indexOf('recover-vita-history.mjs')<script.indexOf('price-vita-history.mjs'));assert.ok(script.indexOf('price-vita-history.mjs')<script.indexOf('exec node'));
});
