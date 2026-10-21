import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('novas APIs respeitam acessos e preservam vínculo, versões e autoria das entregas',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE operation_changes(id TEXT PRIMARY KEY,entity TEXT,data TEXT,version INTEGER,deleted INTEGER,updated_at TEXT);CREATE TABLE app_users(id TEXT PRIMARY KEY,username TEXT,display_name TEXT,password_hash TEXT,password_salt TEXT,role TEXT,permissions TEXT,active INTEGER);CREATE TABLE app_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,created_at TEXT);');
 for(const [id,permissions] of [['a','[]'],['c','["clients"]'],['t','["technicians"]'],['d','["administrative"]'],['e','["executive-summary"]'],['n','[]']]){
 sqlite.prepare('INSERT INTO app_users VALUES(?,?,?,?,?,?,?,1)').run(id,id,id==='a'?'Letícia':id,'x','AAAA',id==='a'?'admin':'member',permissions);
 sqlite.prepare('INSERT INTO app_sessions VALUES(?,?,?,?)').run(createHash('sha256').update('qa-'+id).digest('base64'),id,'2099-01-01T00:00:00Z','2026-10-20T00:00:00Z');
 }
 const db={prepare(sql:string){const stmt=sqlite.prepare(sql);let values:any[]=[];const h={bind(...args:any[]){values=args;return h},async first(){return stmt.get(...values)??null},async all(){return {results:stmt.all(...values)}},async run(){return {meta:{changes:Number(stmt.run(...values).changes)}}}};return h}};
 (globalThis as any).__improveDb=()=>db;
 (globalThis as any).__improveManagement={customers:[{id:'client-ana',name:'Ana'},{id:'client-ana2',name:'Ana Maria'}],staff:[{id:'staff-esdras',name:'Esdras',role:'Técnico'},{id:'staff-mari',name:'Mari',role:'Administrativo'}],fines:[]};
 (globalThis as any).__improveRecords=[{id:'bill-a',client:'Ana',kind:'Mensalidade',period:'2026-10',date:'2026-10-05',amount:10000,payment:'PIX',status:'paid'},{id:'bill-b',client:'Ana Maria',kind:'Mensalidade',period:'2026-10',date:'2026-10-05',amount:90000,payment:'PIX',status:'pending'}];
 (globalThis as any).__improveOperations={sales:[],academyInvoices:[],fuel:[],oil:[],maintenance:[],payroll:[]};
 const dir=path.resolve('tmp/relationship-api');mkdirSync(dir,{recursive:true});
 let s=readFileSync('lib/auth.ts','utf8').replace("'./configured-password-update'","'../../lib/configured-password-update.ts'").replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__improveDb;');
 writeFileSync(path.join(dir,'auth.ts'),'// @ts-nocheck\n'+s);
 for(const [file,name] of [['app/api/customer-history/route.ts','customer'],['app/api/staff-deliveries/route.ts','staff'],['app/api/executive-comparison/route.ts','comparison']]){
 s=readFileSync(file,'utf8').replace("'@/lib/auth'","'./auth.ts'").replace("import {database,getRecords} from '@/lib/finance-store';","const database=globalThis.__improveDb,getRecords=async()=>globalThis.__improveRecords;").replace("import {database} from '@/lib/finance-store';","const database=globalThis.__improveDb;").replace("import {getManagement} from '@/lib/management-store';","const getManagement=async()=>globalThis.__improveManagement;").replace("import {getOperations} from '@/lib/operations-store';","const getOperations=async()=>globalThis.__improveOperations;").replace(/'@\/lib\/([^']+)'/g,"'../../lib/$1.ts'");
 writeFileSync(path.join(dir,name+'.ts'),'// @ts-nocheck\n'+s);
 }
 const customer=await import(pathToFileURL(path.join(dir,'customer.ts')).href),staff=await import(pathToFileURL(path.join(dir,'staff.ts')).href),comparison=await import(pathToFileURL(path.join(dir,'comparison.ts')).href);
 const origin='https://artbec.example',request=(url:string,user='a')=>new Request(origin+url,{headers:{cookie:'artbec_session=qa-'+user}}),post=(body:unknown,user='a',requestOrigin=origin)=>new Request(origin+'/api/staff-deliveries',{method:'POST',headers:{cookie:'artbec_session=qa-'+user,origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const json=async(r:Response)=>await r.json() as any;
 assert.equal((await customer.GET(new Request(origin+'/api/customer-history?id=client-ana'))).status,401);
 assert.equal((await customer.GET(request('/api/customer-history?id=client-ana','n'))).status,403);
 let data=await json(await customer.GET(request('/api/customer-history?id=client-ana','c')));assert.equal(data.sections.length,0);
 data=await json(await customer.GET(request('/api/customer-history?id=client-ana')));assert.equal(data.sections.find((s:any)=>s.key==='monthly').rows.length,1);assert.equal(data.sections.find((s:any)=>s.key==='monthly').rows[0].amount,10000);
 assert.equal((await staff.GET(request('/api/staff-deliveries?staffId=staff-mari','t'))).status,403);
 assert.equal((await staff.GET(request('/api/staff-deliveries?staffId=staff-esdras','d'))).status,403);
 const item={id:randomUUID(),staffId:'staff-esdras',version:0,category:'uniform',item:'Camisa',size:'G',quantity:2,deliveredOn:'2026-10-18',replacementOn:'2026-11-18',receivedConfirmed:false,notes:''};
 assert.equal((await staff.POST(post({action:'save',item},'c'))).status,403);
 assert.equal((await staff.POST(post({action:'save',item},'t','https://other.example'))).status,403);
 assert.equal((await staff.POST(post({action:'save',item:{...item,staffName:'Falso'}},'t'))).status,400);
 let response=await staff.POST(post({action:'save',item},'t'));assert.equal(response.status,200);data=await json(response);assert.equal(data.item.staffName,'Esdras');assert.equal(data.item.createdBy,'t');assert.equal(data.item.version,1);
 assert.equal((await staff.POST(post({action:'save',item},'t'))).status,409);
 assert.equal((await staff.POST(post({action:'save',item:{...item,id:randomUUID(),deliveredOn:'2099-01-01',replacementOn:''}},'t'))).status,400);
 assert.equal((await staff.POST(post({action:'return',id:item.id,staffId:item.staffId,version:1,returnedOn:'2026-10-17'},'t'))).status,400);
 assert.equal((await staff.POST(post({action:'return',id:item.id,staffId:item.staffId,version:1,returnedOn:'2026-10-19'},'t'))).status,200);
 assert.equal((await staff.POST(post({action:'return',id:item.id,staffId:item.staffId,version:2,returnedOn:'2026-10-20'},'t'))).status,400);
 assert.equal((await staff.POST(post({action:'delete',id:item.id,staffId:item.staffId,version:2},'t'))).status,200);
 data=await json(await staff.GET(request('/api/staff-deliveries?staffId=staff-esdras','t')));assert.equal(data.items.length,0);
 assert.equal(sqlite.prepare("SELECT deleted FROM operation_changes WHERE entity='staffDelivery'").get()!.deleted,1);
 assert.equal((await comparison.GET(request('/api/executive-comparison?period=2026-10','c'))).status,403);
 assert.equal((await comparison.GET(request('/api/executive-comparison?period=2026-13','e'))).status,400);
 data=await json(await comparison.GET(request('/api/executive-comparison?period=2026-10&basis=full','e')));assert.equal(data.previousPeriod,'2026-09');assert.equal(data.metrics.find((m:any)=>m.key==='receipts').current,10000);assert.equal(data.metrics.find((m:any)=>m.key==='receipts').previous,0);assert.equal(data.metrics.find((m:any)=>m.key==='receipts').percent,null);
 for(const metric of data.metrics){assert.equal(metric.current,metric.currentRows.reduce((s:number,r:any)=>s+r.amount,0));assert.equal(metric.previous,metric.previousRows.reduce((s:number,r:any)=>s+r.amount,0))}
});
