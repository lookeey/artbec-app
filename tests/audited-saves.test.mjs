import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {auditedDatabase} from '../lib/audit-database.ts';
import {REVIEW_ITEMS} from '../lib/monthly-review.ts';

test('shared audited saves confirm direct writes across every audited table and API without losing concurrency or files',async t=>{
 await mkdir('tmp',{recursive:true});const folder=await mkdtemp(resolve('tmp','shared-saves-'));
 const mf=new Miniflare({script:'',modules:true,d1Databases:['DB']});
 try{
  const raw=await mf.getD1Database('DB');
  for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())await raw.batch((await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>raw.prepare(s)));
  const actor={id:'shared-qa',displayName:'Teste'},originals=new Map(),db=auditedDatabase(raw,actor,originals);
  const eventCount=()=>raw.prepare('SELECT COUNT(*) AS n FROM audit_events').first('n');
  const clearContext=async()=>assert.equal(await raw.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  await t.test('insert, update, RETURNING, rejected guards and delete on all six audited tables',async()=>{
   for(const [table,entity]of [['finance_changes','finance'],['note_changes','note'],['fine_changes','fine'],['management_changes','client'],['operation_changes','sale'],['monthly_reviews','monthlyReview']]){
    const id='shared-'+table,original={id,name:'Original',client:'Cliente teste'},value={...original,name:'Novo'};
    originals.set(table+':'+id,{table,id,data:original});
    const entityTable=['management_changes','operation_changes'].includes(table);
    const columns=['id',...(entityTable?['entity']:table==='monthly_reviews'?['period']:[]),'data','version',...(entityTable?['deleted']:[]),'updated_at'];
    const values=[id,...(entityTable?[entity]:table==='monthly_reviews'?['2026-10']:[]),JSON.stringify(value),1,...(entityTable?[0]:[]),'now'];
    let result=await db.prepare(`INSERT INTO \`${table}\` (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...values).run();
    assert.equal(result.meta.changes,1,table+' insert');
    const ignored=await db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...values).run();assert.equal(ignored.meta.changes,0,table+' ignored insert');
    result=await db.prepare(`UPDATE "${table}" SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id`).bind(JSON.stringify({...value,name:'Editado'}),id,1).run();
    assert.equal(result.meta.changes,1,table+' update');assert.deepEqual(result.results,[{id}]);
    const before=await eventCount();
    result=await db.prepare(`UPDATE ${table} SET data='{}' WHERE id=? AND version=1`).bind(id).run();assert.equal(result.meta.changes,0,table+' stale');assert.equal(await eventCount(),before);
    result=await db.prepare(`DELETE FROM ${table} WHERE id=? AND version=2`).bind(id).run();assert.equal(result.meta.changes,1,table+' delete');
    result=await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();assert.equal(result.meta.changes,0,table+' repeated delete');
    const events=(await raw.prepare('SELECT actor_id,before_data FROM audit_events WHERE source_table=? AND record_id=? ORDER BY sequence').bind(table,id).all()).results;
    assert.equal(events.length,3);assert.ok(events.every(e=>e.actor_id===actor.id));assert.equal(JSON.parse(events[0].before_data).name,'Original');
    await clearContext();
   }
  });
  await t.test('batch result positions, bulk counts, rollback and concurrent editors',async()=>{
   const id='shared-batch',insert=()=>db.prepare("INSERT OR IGNORE INTO operation_changes VALUES (?,'price',?,1,0,'now')").bind(id,JSON.stringify({id,value:1}));
   const result=await db.batch([insert(),db.prepare('SELECT version FROM operation_changes WHERE id=?').bind(id),insert(),db.prepare("UPDATE operation_changes SET version=2 WHERE id=? AND version=99").bind(id),raw.prepare('SELECT 7 AS value')]);
   assert.equal(result.length,5);assert.equal(result[0].meta.changes,1);assert.equal(result[1].results[0].version,1);assert.equal(result[2].meta.changes,0);assert.equal(result[3].meta.changes,0);assert.equal(result[4].results[0].value,7);
   const other=auditedDatabase(raw,{id:'other',displayName:'Outra pessoa'},originals);
   const writes=await Promise.all([db.prepare("UPDATE operation_changes SET data=?,version=2 WHERE id=? AND version=1").bind(JSON.stringify({editor:actor.id}),id).run(),other.prepare("UPDATE operation_changes SET data=?,version=2 WHERE id=? AND version=1").bind(JSON.stringify({editor:'other'}),id).run()]);
   assert.deepEqual(writes.map(r=>r.meta.changes).sort(),[0,1]);
   const row=await raw.prepare('SELECT data FROM operation_changes WHERE id=?').bind(id).first();
   const audit=await raw.prepare('SELECT actor_id FROM audit_events WHERE record_id=? ORDER BY sequence DESC LIMIT 1').bind(id).first();assert.equal(audit.actor_id,JSON.parse(row.data).editor);
   await db.batch([0,1,2].map(n=>db.prepare("INSERT INTO operation_changes VALUES (?,'price','{}',1,0,'now')").bind('shared-bulk-'+n)));
   const bulk=await db.prepare("UPDATE operation_changes SET data='{\"bulk\":true}',version=2 WHERE id LIKE 'shared-bulk-%'").run();assert.equal(bulk.meta.changes,3);
   const count=await eventCount();
   await assert.rejects(db.batch([db.prepare("INSERT INTO management_changes VALUES ('shared-rollback','client','{}',1,0,'now')"),db.prepare("INSERT INTO management_changes VALUES ('shared-rollback','client','{}',1,0,'now')")]));
   assert.equal(await raw.prepare("SELECT COUNT(*) AS n FROM management_changes WHERE id='shared-rollback'").first('n'),0);assert.equal(await eventCount(),count);await clearContext();
  });
  await t.test('real notes, products, prices and monthly review APIs return success and advance versions',async()=>{
   const originalOperations=Object.fromEntries(['price','sale','academyInvoice','expenseTechnician','stockMovement','fuel','oil','stock','bike','maintenance','payroll','process','vitaClosing'].map(entity=>[entity,new Map()]));
   globalThis.__sharedSaveStore={database:next=>next?auditedDatabase(raw,next,originals):raw,originalOperations};
   await writeFile(resolve(folder,'auth.ts'),"// @ts-nocheck\nexport const authorize=async()=>({user:{id:'shared-qa',displayName:'Teste',role:'admin'},error:null}),authorizeAdmin=authorize,canAccess=()=>true;");
   const scope=(await readFile('lib/access-scope.ts','utf8')).replace("'./sale-catalog'","'../../lib/sale-catalog.ts'").replace("'./stock-delivery'","'../../lib/stock-delivery.ts'");
   await writeFile(resolve(folder,'access-scope.ts'),'// @ts-nocheck\n'+scope);
   const api=async(name,file,replacements=[])=>{
    let code=(await readFile(file,'utf8')).replace("'@/lib/auth'","'./auth.ts'").replace("'@/lib/access-scope'","'./access-scope.ts'");
    for(const [from,to]of replacements)code=code.replace(from,to);
    code=code.replace(/'@\/lib\/([^']+)'/g,"'../../lib/$1.ts'");
    await writeFile(resolve(folder,name+'.ts'),'// @ts-nocheck\n'+code);return import(pathToFileURL(resolve(folder,name+'.ts')).href);
   };
   const database="const database=globalThis.__sharedSaveStore.database;";
   const noteApi=await api('notes','app/api/notes/route.ts',[["import {database,getNotes,originalNotes} from '@/lib/finance-store';",database+'const getNotes=async()=>[],originalNotes=new Map();']]);
   const operationsApi=await api('operations','app/api/operations/route.ts',[["import {database} from '@/lib/finance-store';",database],["import {getOperations,originalOperations,type OperationEntity} from '@/lib/operations-store';","const originalOperations=globalThis.__sharedSaveStore.originalOperations,getOperations=async()=>({stock:[],stockMovements:[],sales:[]});"],["import {getManagement} from '@/lib/management-store';","const getManagement=async()=>({customers:[],staff:[],fines:[]});"]]);
   const reviewApi=await api('review','app/api/monthly-review/route.ts',[["import {database} from '@/lib/finance-store';",database]]);
   const origin='https://artbec.example',request=(method,body)=>new Request(origin+'/api/test',{method,headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
   const note={id:'note-new-'+randomUUID(),version:0,client:'Cliente teste',serviceDay:2,dueDay:10,requiresInvoice:true,requiresBoleto:false,requiresInss:false,requiresEmail:false,monthly:{'2026-10':false},source:'Teste',sourceRow:0};
   let response=await noteApi.POST(request('POST',note));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));let saved=(await response.json()).note;assert.equal(saved.version,1);
   response=await noteApi.POST(request('POST',{...saved,monthly:{'2026-10':true}}));assert.equal(response.status,200);assert.equal((await response.json()).note.version,2);assert.equal((await noteApi.POST(request('POST',note))).status,409);
   const price={id:'price-'+randomUUID(),version:0,product:'Produto teste',kind:'Revenda',supplier:'',price:3200};
   response=await operationsApi.POST(request('POST',{entity:'price',item:price}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));saved=(await response.json()).item;
   response=await operationsApi.POST(request('POST',{entity:'price',item:{...saved,price:3500}}));assert.equal(response.status,200);saved=(await response.json()).item;assert.equal(saved.version,2);
   assert.equal((await operationsApi.DELETE(request('DELETE',{entity:'price',id:saved.id,version:2}))).status,200);
   const sale={id:'sale-'+randomUUID(),version:0,date:'2026-10-23',dateNote:'',period:'2026-10',channel:'Clientes',client:'Cliente teste',product:'Produto teste',quantity:1,unitPrice:3200,total:3200,status:'pending',deliveryStatus:'pending',source:'Teste',sourceRow:0};
   response=await operationsApi.POST(request('POST',{entity:'sale',item:sale}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));saved=(await response.json()).item;
   response=await operationsApi.POST(request('POST',{entity:'sale',item:{...saved,status:'paid'}}));assert.equal(response.status,200);assert.equal((await response.json()).item.version,2);
   const review={period:'2026-10',key:REVIEW_ITEMS[0].key,done:true,note:'Conferido',version:0};response=await reviewApi.POST(request('POST',review));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));saved=(await response.json()).item;
   assert.equal(saved.version,1);response=await reviewApi.POST(request('POST',{...review,done:false,version:1}));assert.equal(response.status,200);assert.equal((await response.json()).item.version,2);
   // Photo routes used to delete the newly uploaded object after a false 409.
   const files=new Map();let deletions=0;globalThis.__sharedSaveBucket={put:async(key,bytes)=>files.set(key,new Uint8Array(bytes)),delete:async key=>{deletions++;files.delete(key)}};
   originalOperations.stock.set('stock-shared-upload',{id:'stock-shared-upload',product:'Produto teste',initial:0,incoming:0,outgoing:0,minimum:1,version:0});
   const photoApi=await api('photo','app/api/stock-images/route.ts',[["import {env} from 'cloudflare:workers';","const env={DOCUMENTS:globalThis.__sharedSaveBucket};"],["import {database} from '@/lib/finance-store';",database],["import {originalOperations} from '@/lib/operations-store';","const originalOperations=globalThis.__sharedSaveStore.originalOperations;"]]);
   const photo=version=>{const form=new FormData();form.set('productId','stock-shared-upload');form.set('version',String(version));form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'}));return photoApi.POST(new Request(origin+'/api/stock-images',{method:'POST',headers:{origin},body:form}))};
   response=await photo(0);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));saved=(await response.json()).item;assert.equal(saved.version,1);assert.ok(files.has(saved.imageKey));
   response=await photo(1);assert.equal(response.status,200);saved=(await response.json()).item;assert.equal(saved.version,2);assert.ok(files.has(saved.imageKey));assert.equal(deletions,0);
   assert.equal((await photo(0)).status,409);assert.equal(files.size,2);await clearContext();
  });
 }finally{await mf.dispose();delete globalThis.__sharedSaveStore;delete globalThis.__sharedSaveBucket;await rm(folder,{recursive:true,force:true})}
});
