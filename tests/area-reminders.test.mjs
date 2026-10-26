import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {auditedDatabase} from '../lib/audit-database.ts';
import {RECOVERABLE_ENTITIES} from '../lib/data-security.ts';

test('area reminders persist independently with real authorization, version guards and recoverable audited deletion',async()=>{
 await mkdir('tmp',{recursive:true});const folder=await mkdtemp(resolve('tmp','area-reminders-'));
 const mf=new Miniflare({script:'',modules:true,d1Databases:['DB']});
 try{
  const raw=await mf.getD1Database('DB');
  for(const file of (await readdir('drizzle')).filter(file=>file.endsWith('.sql')).sort())await raw.batch((await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean).map(sql=>raw.prepare(sql)));
  // Exercise the app's real authentication/permission checks, not a permissive stub.
  for(const [id,permissions] of [['payroll',['payroll']],['fines',['fines']],['reminders',['reminders']],['none',[]],['both',['payroll','fines']]]){
   await raw.prepare('INSERT INTO app_users (id,username,display_name,password_hash,password_salt,role,permissions,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)').bind(id,id,id,'unused','unused','member',JSON.stringify(permissions),'2026-10-26T12:00:00Z','2026-10-26T12:00:00Z').run();
   await raw.prepare('INSERT INTO app_sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(createHash('sha256').update('test-'+id).digest('base64'),id,'2099-01-01T00:00:00Z','2026-10-26T12:00:00Z').run();
  }
  globalThis.__areaReminderDb=actor=>actor?auditedDatabase(raw,actor,new Map()):raw;
  let auth=(await readFile('lib/auth.ts','utf8')).replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__areaReminderDb;').replace("'./configured-password-update'","'../../lib/configured-password-update.ts'");
  await writeFile(resolve(folder,'auth.ts'),'// @ts-nocheck\n'+auth);
  const route=(await readFile('app/api/area-reminders/route.ts','utf8')).replace("'@/lib/auth'","'./auth.ts'").replace("import {database} from '@/lib/finance-store';",'const database=globalThis.__areaReminderDb;');
  await writeFile(resolve(folder,'route.ts'),'// @ts-nocheck\n'+route);
  const api=await import(pathToFileURL(resolve(folder,'route.ts')).href);
  const origin='https://artbec.example',request=(area,user='both',method='GET',body,headers={})=>new Request(origin+'/api/area-reminders?area='+area,{method,headers:{origin,cookie:'artbec_session=test-'+user,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const reminders=async(area,user='both')=>{const response=await api.GET(request(area,user));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');return (await response.json()).reminders};
  assert.equal((await api.GET(new Request(origin+'/api/area-reminders?area=payroll'))).status,401);
  for(const user of ['none','reminders'])for(const area of ['payroll','fines'])assert.equal((await api.GET(request(area,user))).status,403);
  assert.equal((await api.GET(request('fines','payroll'))).status,403);
  assert.equal((await api.GET(request('payroll','fines'))).status,403);
  assert.equal((await api.GET(request('clients'))).status,400);
  const draft={id:'areaReminder-payroll-'+randomUUID(),version:0,text:'  Conferir o adiantamento do dia 15.\nRevisar os descontos.  '};
  assert.equal((await api.POST(request('payroll','fines','POST',draft))).status,403);
  assert.equal((await api.POST(request('payroll','both','POST',draft,{origin:'https://other.example'}))).status,403);
  assert.equal((await api.POST(request('payroll','both','POST',{...draft,text:'   '}))).status,400);
  assert.equal((await api.POST(request('payroll','both','POST',{...draft,text:'x'.repeat(4001)}))).status,400);
  assert.equal((await api.POST(new Request(origin+'/api/area-reminders?area=payroll',{method:'POST',headers:{origin,cookie:'artbec_session=test-both','Content-Type':'application/json'},body:'{bad'}))).status,400);
  let response=await api.POST(request('payroll','payroll','POST',draft));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  let saved=(await response.json()).reminder;assert.equal(saved.version,1);assert.equal(saved.text,draft.text.trim());
  assert.deepEqual(await reminders('payroll','payroll'),[saved]);assert.deepEqual(await reminders('fines','fines'),[]);
  assert.equal((await api.POST(request('fines','both','POST',{...saved,text:'Mover área'}))).status,403);
  assert.equal((await api.DELETE(request('fines','both','DELETE',saved))).status,403);
  const other={id:'areaReminder-payroll-'+randomUUID(),version:0,text:'Segundo lembrete'};
  assert.equal((await api.POST(request('payroll','payroll','POST',other))).status,200);
  const fine={id:'areaReminder-fines-'+randomUUID(),version:0,text:'Conferir o vencimento das multas'};
  assert.equal((await api.POST(request('fines','fines','POST',fine))).status,200);
  assert.equal((await reminders('payroll')).length,2);assert.equal((await reminders('fines')).length,1);
  response=await api.POST(request('payroll','payroll','POST',{...saved,text:'Texto revisado'}));assert.equal(response.status,200);saved=(await response.json()).reminder;assert.equal(saved.version,2);
  assert.equal((await api.POST(request('payroll','payroll','POST',draft))).status,409);
  assert.equal((await api.DELETE(request('payroll','payroll','DELETE',{...saved,version:1}))).status,409);
  // Concurrent edits of the same version: exactly one succeeds.
  const concurrent=await Promise.all(['Primeiro','Segundo'].map(text=>api.POST(request('payroll','payroll','POST',{...saved,text}))));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  saved=(await concurrent.find(r=>r.status===200).json()).reminder;assert.equal(saved.version,3);
  assert.equal((await api.DELETE(request('payroll','payroll','DELETE',saved))).status,200);
  assert.equal((await reminders('payroll')).length,1);assert.equal((await reminders('fines')).length,1);
  assert.equal((await api.POST(request('payroll','payroll','POST',saved))).status,409);
  const deleted=await raw.prepare('SELECT * FROM operation_changes WHERE id=?').bind(saved.id).first();assert.equal(deleted.deleted,1);assert.equal(JSON.parse(deleted.data).text,saved.text);
  const event=await raw.prepare("SELECT before_data,actor_id FROM audit_events WHERE record_id=? AND action='deleted' ORDER BY sequence DESC LIMIT 1").bind(saved.id).first();assert.equal(JSON.parse(event.before_data).text,saved.text);assert.equal(event.actor_id,'payroll');
  assert.ok(RECOVERABLE_ENTITIES.includes('areaReminder'));
  assert.equal(await raw.prepare('SELECT COUNT(*) AS n FROM audit_context').first('n'),0);
  // GET is persisted database state, independent of the component/browser state.
  const freshApi=await import(pathToFileURL(resolve(folder,'route.ts')).href+'?fresh=1');
  assert.equal((await (await freshApi.GET(request('fines','fines'))).json()).reminders[0].text,fine.text);
 }finally{await mf.dispose();delete globalThis.__areaReminderDb;await rm(folder,{recursive:true,force:true})}
});
