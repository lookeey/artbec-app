// Tests exercise the real SQLite triggers, D1 transaction wrapper and API handlers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {auditedDatabase} from '../lib/audit-database.ts';
import {reviewItems,REVIEW_ITEMS} from '../lib/monthly-review.ts';
import {auditDifferences} from '../lib/data-security.ts';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['0000_redundant_spectrum','0001_peaceful_whizzer','0002_bumpy_millenium_guard','0003_wealthy_dragon_lord','0004_sunny_warehouse','0012_elite_stature'])sqlite.exec(readFileSync('drizzle/'+name+'.sql','utf8'));
 function prepare(sql:string){const statement=sqlite.prepare(sql);let values:any[]=[];const handle={bind(...p:any[]){values=p;return handle},async first(){return statement.get(...values)??null},async all(){return {results:statement.all(...values),meta:{}}},async run(){return {results:[],meta:{changes:Number(statement.run(...values).changes)}}}};return handle}
 const db={prepare,async batch(statements:any[]){sqlite.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.allOrRun?.()??await stmt.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 // D1 batch supports both SELECT and mutating statements.
 const nativePrepare=db.prepare;
 db.prepare=(sql:string)=>{const raw=nativePrepare(sql);return Object.assign(raw,{allOrRun:()=>/^\s*SELECT/i.test(sql)?raw.all():raw.run()})};
 return {sqlite,db:db as unknown as D1Database};
}
test('atomic audit captures authenticated actors, original imported records, deletes and failed transactions',async()=>{
 const {sqlite,db}=fixture(),originals=new Map([['operation_changes:sale-import',{table:'operation_changes',id:'sale-import',data:{id:'sale-import',client:'Ana',total:10000}}]]);
 const a=auditedDatabase(db,{id:'a',displayName:'Letícia'},originals),b=auditedDatabase(db,{id:'m',displayName:'Marilene'},originals);
 await a.prepare("INSERT INTO operation_changes VALUES (?,'sale',?,1,0,?)").bind('sale-import',JSON.stringify({id:'sale-import',client:'Ana',total:12000}),'2026-10-19').run();
 let event=sqlite.prepare('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 1').get()!;
 assert.equal(event.actor_name,'Letícia');assert.equal(event.action,'updated');assert.equal(JSON.parse(String(event.before_data)).total,10000);
 await b.prepare("UPDATE operation_changes SET data=?,version=2 WHERE id=? AND version=1").bind(JSON.stringify({id:'sale-import',client:'Ana',total:15000}),'sale-import').run();
 event=sqlite.prepare('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 1').get()!;assert.equal(event.actor_name,'Marilene');assert.equal(JSON.parse(String(event.before_data)).total,12000);
 await a.prepare("UPDATE operation_changes SET data='{}',deleted=1,version=3 WHERE id=? AND version=2").bind('sale-import').run();
 event=sqlite.prepare('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 1').get()!;assert.equal(event.action,'deleted');assert.equal(JSON.parse(String(event.before_data)).total,15000);
 const count=sqlite.prepare('SELECT count(*) as n FROM audit_events').get()!.n;
 await a.prepare('UPDATE operation_changes SET data=? WHERE id=? AND version=1').bind('{}','sale-import').run();
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM audit_events').get()!.n,count);
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM audit_context').get()!.n,0);
 await assert.rejects(a.batch([a.prepare("INSERT INTO management_changes VALUES ('bad','client','{}',1,0,'x')"),a.prepare("INSERT INTO management_changes VALUES ('bad','client','{}',1,0,'x')")]));
 assert.equal(sqlite.prepare("SELECT count(*) as n FROM management_changes WHERE id='bad'").get()!.n,0);
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM audit_events').get()!.n,count);
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM audit_context').get()!.n,0);
 assert.throws(()=>sqlite.exec('DELETE FROM audit_events'),/immutable/);
 assert.throws(()=>sqlite.exec("UPDATE audit_events SET actor_name='Other'"),/immutable/);
 assert.deepEqual(auditDifferences({amount:10000,version:1},{amount:15000,version:2}),[{key:'amount',before:10000,after:15000}]);
});
test('security and monthly API enforce session permissions, safe restore, concurrency and month isolation',async()=>{
 const {sqlite,db}=fixture();sqlite.exec("CREATE TABLE app_users(id TEXT PRIMARY KEY,username TEXT,display_name TEXT,password_hash TEXT,password_salt TEXT,role TEXT,permissions TEXT,active INTEGER);CREATE TABLE app_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,created_at TEXT);");
 for(const [id,role,permissions] of [['a','admin','[]'],['m','member','["monthly-review"]'],['n','member','[]']]){
  sqlite.prepare('INSERT INTO app_users VALUES(?,?,?,?,?,?,?,1)').run(id,id,id==='a'?'Letícia':'Marilene','test','AAAA',role,permissions);
  sqlite.prepare('INSERT INTO app_sessions VALUES(?,?,?,?)').run(createHash('sha256').update('qa-'+id).digest('base64'),id,'2099-01-01T00:00:00Z','2026-10-19T00:00:00Z');
 }
 const originals=new Map<string,any>();(globalThis as any).__securityDb=(actor?:{id:string;displayName:string})=>actor?auditedDatabase(db,actor,originals):db;(globalThis as any).__securityOriginals=originals;
 const dir=path.resolve('tmp/data-security-api');mkdirSync(dir,{recursive:true});
 let auth=readFileSync('lib/auth.ts','utf8').replace("'./configured-password-update'","'../../lib/configured-password-update.ts'").replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__securityDb;');writeFileSync(path.join(dir,'auth.ts'),'// @ts-nocheck\n'+auth);
 let source=readFileSync('app/api/data-security/route.ts','utf8').replace("'@/lib/auth'","'./auth.ts'").replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__securityDb;').replace("import {businessOriginals} from '@/lib/original-business';",'const businessOriginals=globalThis.__securityOriginals;').replace("'@/lib/data-security'","'../../lib/data-security.ts'").replace("import {createSafetyBackup,downloadSafetyBackup,type BackupRow} from '@/lib/security-backup-store';","const createSafetyBackup=()=>({id:'safe'}),downloadSafetyBackup=()=>new Response('backup');type BackupRow=any;").replace("'@/lib/stock-delivery'","'../../lib/stock-delivery.ts'").replace("import {getOperations} from '@/lib/operations-store';","const getOperations=async()=>globalThis.__restoreOperations?globalThis.__restoreOperations():({stock:[],stockMovements:[],sales:[]});");
 writeFileSync(path.join(dir,'security.ts'),'// @ts-nocheck\n'+source);
 source=readFileSync('app/api/monthly-review/route.ts','utf8').replace("'@/lib/auth'","'./auth.ts'").replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__securityDb;').replace("'@/lib/monthly-review'","'../../lib/monthly-review.ts'");
 writeFileSync(path.join(dir,'review.ts'),'// @ts-nocheck\n'+source);
 const api=await import(pathToFileURL(path.join(dir,'security.ts')).href),review=await import(pathToFileURL(path.join(dir,'review.ts')).href);
 const origin='https://artbec.example',req=(url:string,user='a')=>new Request(origin+url,{headers:{cookie:'artbec_session=qa-'+user}}),post=(body:unknown,user='a',o=origin)=>new Request(origin+'/api/data-security',{method:'POST',headers:{cookie:'artbec_session=qa-'+user,origin:o,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await api.GET(new Request(origin+'/api/data-security'))).status,401);
 assert.equal((await api.GET(req('/api/data-security','m'))).status,403);
 assert.equal((await api.POST(post({action:'backup',daily:false},'m'))).status,403);
 const id='complaint-'+randomUUID(),data={id,clientName:'Ana',title:'Timer',status:'open',photos:[{key:'private/photo.png'}],events:[{detail:'Relato original'}],version:1};
 const actor={id:'a',displayName:'Letícia'},writer=auditedDatabase(db,actor,originals);
 await writer.prepare("INSERT INTO operation_changes VALUES (?,'complaint',?,1,0,'2026-10-19')").bind(id,JSON.stringify(data)).run();
 await writer.prepare("UPDATE operation_changes SET data='{}',version=2,deleted=1 WHERE id=?").bind(id).run();
 let trash=await (await api.GET(req('/api/data-security?mode=trash'))).json();
 assert.equal(trash.items.length,1);assert.equal(trash.items[0].data.photos[0].key,'private/photo.png');
 const restore={action:'restore',table:'operation_changes',id,version:2,confirmation:'RESTAURAR'};
 assert.equal((await api.POST(post({...restore,confirmation:'sim'}))).status,400);
 assert.equal((await api.POST(post(restore,'a','https://other.example'))).status,403);
 assert.equal((await api.POST(post({...restore,table:'app_users'}))).status,400);
 assert.equal((await api.POST(post(restore))).status,200);
 assert.equal((await api.POST(post(restore))).status,409);
 const saved=sqlite.prepare('SELECT * FROM operation_changes WHERE id=?').get(id)!;assert.equal(saved.deleted,0);assert.equal(saved.version,3);assert.equal(JSON.parse(String(saved.data)).events[0].detail,'Relato original');
 assert.equal(sqlite.prepare("SELECT action FROM audit_events ORDER BY sequence DESC LIMIT 1").get()!.action,'restored');
 trash=await (await api.GET(req('/api/data-security?mode=trash'))).json();assert.equal(trash.items.length,0);
 const history=await (await api.GET(req('/api/data-security?mode=history&q=Timer'))).json();assert.equal(history.total,3);
 assert.equal((await review.GET(req('/api/monthly-review?period=2026-10','n'))).status,403);
 const getReview=(period:string)=>review.GET(req('/api/monthly-review?period='+period,'m'));
 let result=await (await getReview('2026-10')).json();assert.equal(result.items.length,REVIEW_ITEMS.length);assert.equal(result.items.some((i:any)=>i.done),false);
 const mark={period:'2026-10',key:'monthly',version:0,done:true,note:'Comprovantes conferidos.'};
 assert.equal((await review.POST(post(mark,'m'))).status,200);assert.equal((await review.POST(post(mark,'m'))).status,409);
 result=await (await getReview('2026-10')).json();assert.equal(result.items[0].done,true);assert.equal(result.items[0].checkedBy,'Marilene');assert.ok(result.items[0].checkedAt);
 result=await (await getReview('2026-11')).json();assert.equal(result.items.some((i:any)=>i.done),false);
 assert.equal((await review.POST(post({...mark,period:'2026-13'},'m'))).status,400);
 assert.equal((await review.POST(post({...mark,version:1,done:false},'m'))).status,200);
 result=await (await getReview('2026-10')).json();assert.equal(result.items[0].checkedBy,'');assert.equal(result.items[0].version,2);
 const count=sqlite.prepare("SELECT count(*) as n FROM audit_events WHERE entity='monthlyReview'").get()!.n;assert.equal(count,2);
 const saleId='sale-'+randomUUID(),sale={id:saleId,client:'Bia',deliveryStatus:'delivered',stockItems:[{productId:'stock-one',quantity:2}]};
 await writer.prepare("INSERT INTO operation_changes VALUES (?,'sale',?,1,0,'2026-10-19')").bind(saleId,JSON.stringify(sale)).run();
 await writer.prepare('UPDATE operation_changes SET deleted=1,version=2 WHERE id=?').bind(saleId).run();
 const restoreSale={action:'restore',table:'operation_changes',id:saleId,version:2,confirmation:'RESTAURAR'};
 assert.equal((await api.POST(post(restoreSale))).status,409);
 const enough={stock:[{id:'stock-one',product:'Cloro',initial:3,incoming:0,outgoing:0}],stockMovements:[],sales:[]};
 (globalThis as any).__restoreOperations=async()=>{sqlite.prepare("INSERT INTO operation_changes VALUES ('racing','process','{}',1,0,'x')").run();return enough};
 assert.equal((await api.POST(post(restoreSale))).status,409);
 (globalThis as any).__restoreOperations=async()=>enough;
 assert.equal((await api.POST(post(restoreSale))).status,200);delete (globalThis as any).__restoreOperations;

});

test('server backup preserves a consistent dump, original base and checksum without exposing another person’s private tasks',async()=>{
 const {sqlite,db}=fixture();
 sqlite.exec("CREATE TABLE personal_tasks(id TEXT,user_id TEXT,title TEXT);INSERT INTO personal_tasks VALUES ('own','a','Privada Letícia'),('other','m','Privada Mari');");
 const objects=new Map<string,{bytes:Uint8Array;metadata:any}>();
 (globalThis as any).__backupEnv={DOCUMENTS:{async put(key:string,bytes:Uint8Array,metadata:any){objects.set(key,{bytes:new Uint8Array(bytes),metadata})},async delete(key:string){objects.delete(key)},async get(key:string){const file=objects.get(key);return file?{body:file.bytes}:null}}};
 let source=readFileSync('lib/security-backup-store.ts','utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__backupEnv;').replace("import type {AuthUser} from './auth';",'type AuthUser=any;').replace("import {PERSONAL_TASK_SQL} from './personal-tasks';","import {PERSONAL_TASK_SQL} from '../../lib/personal-tasks.ts';").replace("import {originalBusinessRows} from './original-business';","const originalBusinessRows=[{table:'finance_changes',id:'base',data:{client:'Original'}}];").replace("import {businessToday} from './month-rollover';","const businessToday=()=>'2026-10-19';");
 const dir=path.resolve('tmp/data-security-api');mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'backup.ts'),'// @ts-nocheck\n'+source);
 const backup=await import(pathToFileURL(path.join(dir,'backup.ts')).href),user={id:'a',displayName:'Letícia'};
 const first=await backup.createSafetyBackup(db,user,true),second=await backup.createSafetyBackup(db,user,true);
 assert.equal(first.id,second.id);assert.equal(objects.size,1);
 const file=objects.get(first.object_key)!;const dump=JSON.parse(new TextDecoder().decode(file.bytes));
 assert.equal(dump.format,'artbec-d1-dump-v1');assert.equal(dump.importedBase[0].data.client,'Original');
 assert.equal(dump.tables.personal_tasks.rows.length,1);assert.equal(dump.tables.personal_tasks.rows[0].user_id,'a');
 assert.equal(dump.tableCount,Object.keys(dump.tables).length);assert.equal(first.sha256,createHash('sha256').update(file.bytes).digest('hex'));
 assert.equal(first.row_count,Object.values(dump.tables).reduce((sum:number,t:any)=>sum+t.rowCount,0));
 const manual=await backup.createSafetyBackup(db,user,false);assert.notEqual(manual.id,first.id);assert.equal(objects.size,2);
 const response=await backup.downloadSafetyBackup(first);assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/attachment/);
 const downloaded=await response.json() as any;assert.equal(downloaded.tables.personal_tasks.rows.length,1);
 assert.equal(reviewItems([]).every(i=>!i.done&&i.version===0),true);
});
