import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare} from 'miniflare';
import {auditedDatabase} from '../lib/audit-database.ts';
import {savePaymentStatus,PaymentUpdateError} from '../lib/record-payment.ts';

const original={id:'import-99-1',version:0,kind:'Mensalidade',period:'2026-10',client:'Cliente teste',date:'2026-10-10',amount:25000,net:null,payment:'PIX',description:'Mensalidade',netNote:'',status:'pending'};
const origin='https://artbec.example';
test('payment saves in real D1 with audit triggers, returns the new version and rejects stale writes',async()=>{
 const mf=new Miniflare({script:'',modules:true,d1Databases:['DB']});
 await mkdir('tmp',{recursive:true});const folder=await mkdtemp(resolve('tmp','monthly-'));
 try{
  const raw=await mf.getD1Database('DB');
  for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile(resolve('drizzle',file),'utf8');
   await raw.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>raw.prepare(s)));
  }
  const actor={id:'test-admin',displayName:'Teste'};
  globalThis.__monthlyOriginals=new Map([[original.id,original]]);
  globalThis.__monthlyDb=auditedDatabase(raw,actor,new Map([['finance_changes:'+original.id,{table:'finance_changes',id:original.id,data:original}]]));
  let source=await readFile('app/api/records/route.ts','utf8');
  source=source.replace("'@/lib/service-execution'","'../../lib/service-execution.ts'").replace("'@/lib/monthly-billing'","'../../lib/monthly-billing.ts'").replace("'@/lib/annual-adjustments'","'../../lib/annual-adjustments.ts'")
   .replace("import {database,getRecords,originals} from '@/lib/finance-store';","const database=()=>globalThis.__monthlyDb,originals=globalThis.__monthlyOriginals,getRecords=async()=>[];")
   .replace("import {authorize,canAccess} from '@/lib/auth';","const authorize=async()=>({user:{id:'test-admin',displayName:'Teste'},error:null}),canAccess=()=>true;");
  await writeFile(resolve(folder,'route.ts'),'// @ts-nocheck\n'+source);
  const api=await import(pathToFileURL(resolve(folder,'route.ts')).href);
  const post=record=>api.POST(new Request(origin+'/api/records',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(record)}));
  let response=await post({...original,status:'paid'});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  let {record}=await response.json();assert.equal(record.version,1);assert.equal(record.status,'paid');
  response=await post({...record,status:'pending'});assert.equal(response.status,200);
  record=(await response.json()).record;assert.equal(record.version,2);assert.equal(record.status,'pending');
  response=await post({...record,status:'paid'});assert.equal(response.status,200);
  assert.equal((await response.json()).record.version,3);
  assert.equal((await post({...original,status:'pending'})).status,409);
  const saved=await raw.prepare('SELECT data,version FROM finance_changes WHERE id=?').bind(original.id).first();
  assert.equal(saved.version,3);assert.equal(JSON.parse(saved.data).status,'paid');
  const events=(await raw.prepare("SELECT actor_id,action,before_data,after_data FROM audit_events WHERE record_id=? ORDER BY sequence").bind(original.id).all()).results;
  assert.equal(events.length,3);assert.ok(events.every(event=>event.actor_id===actor.id));
  assert.equal(JSON.parse(events[0].before_data).status,'pending');
  assert.equal(JSON.parse(events[2].after_data).status,'paid');
  assert.equal((await raw.prepare('SELECT * FROM audit_context').all()).results.length,0);
 }finally{await mf.dispose();delete globalThis.__monthlyDb;delete globalThis.__monthlyOriginals;await rm(folder,{recursive:true,force:true})}
});

test('a stale payment refreshes and retries only the requested status, preserving concurrent edits',async()=>{
 const current={...original,version:2,amount:38000,date:'2026-10-20',payment:'BOLETO'};
 const requests=[];
 const request=async(url,options)=>{
  requests.push({url,...options});
  if(requests.length===1)return Response.json({error:'stale'},{status:409});
  if(requests.length===2)return Response.json({records:[current]});
  const submitted=JSON.parse(options.body);assert.deepEqual(submitted,{...current,status:'paid'});
  return Response.json({record:{...submitted,version:3}});
 };
 const saved=await savePaymentStatus(original,'paid',request);
 assert.equal(saved.version,3);assert.equal(saved.amount,38000);assert.equal(saved.status,'paid');
 assert.equal(requests.length,3);assert.equal(requests[1].cache,'no-store');
});

test('already paid in another window needs no second write; repeated conflicts keep the current row',async()=>{
 let calls=0;const paid={...original,version:1,status:'paid'};
 assert.deepEqual(await savePaymentStatus(original,'paid',async()=>++calls===1?Response.json({error:'stale'},{status:409}):Response.json({records:[paid]})),paid);
 assert.equal(calls,2);
 let version=0;
 await assert.rejects(savePaymentStatus(original,'paid',async(url,options)=>options.method==='POST'?Response.json({error:'stale'},{status:409}):Response.json({records:[{...original,version:++version,amount:31000}]})),error=>error instanceof PaymentUpdateError&&error.record.version===2&&error.record.amount===31000&&!/recarreg|atualize.*página/i.test(error.message));
});
