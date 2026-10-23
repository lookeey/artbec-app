import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare} from 'miniflare';
import {monthlyPaymentStatus} from '../lib/monthly-billing.ts';
import {businessToday} from '../lib/month-rollover.ts';

const origin='https://artbec.example';
const base=(id,client,period,kind='Mensalidade')=>({id,version:0,kind,period,client,date:period+'-10',amount:25000,net:null,payment:'PIX',description:kind,netNote:'',status:'pending'});
test('exclusion is authorized, versioned and persistent, stops rollover and preserves earlier months and services',async()=>{
 await mkdir('tmp',{recursive:true});const folder=await mkdtemp(resolve('tmp','monthly-options-'));
 const options={script:'',modules:true,d1Databases:['DB'],d1Persist:resolve(folder,'state')};
 let mf=new Miniflare(options);
 const records=[{...base('import-90-1','Ána','2026-09'),status:'paid'},base('import-90-2',' ÁNA ','2026-10'),base('import-90-3','Ana','2026-11'),base('import-90-4','Bruno','2026-10'),base('import-90-5','Ana','2026-10','Serviço'),base('import-90-6','Anabela','2026-10')];
 try{
  let raw=await mf.getD1Database('DB');
  for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())await raw.batch((await readFile(resolve('drizzle',name),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>raw.prepare(s)));
  globalThis.__optionsRaw=raw;globalThis.__optionsBase={records};globalThis.__optionsDay='2026-11-04';globalThis.__optionsPeriod='2026-11';
  globalThis.__optionsOriginals=new Map(records.map(record=>['finance_changes:'+record.id,{table:'finance_changes',id:record.id,data:record}]));
  let source=await readFile('lib/finance-store.ts','utf8');
  source=source.replace("'./monthly-billing'","'../../lib/monthly-billing.ts'").replace("'./audit-database'","'../../lib/audit-database.ts'")
   .replace("import {businessOriginals} from './original-business';","const businessOriginals=globalThis.__optionsOriginals;")
   .replace("import {env} from 'cloudflare:workers';","const env={get DB(){return globalThis.__optionsRaw}};")
   .replace("import source from '@/data/source.json';","const source=globalThis.__optionsBase;")
   .replace("import noteSource from '@/data/notes.json';","const noteSource={notes:[]};")
   .replace("import managementSource from '@/data/management.json';","const managementSource={fines:[]};")
   .replace("'@/lib/annual-adjustments'","'../../lib/annual-adjustments.ts'")
   .replace("import {businessToday,currentPeriod,nextPeriod,moveDueDate} from '@/lib/month-rollover';","import {nextPeriod,moveDueDate} from '../../lib/month-rollover.ts';const businessToday=()=>globalThis.__optionsDay,currentPeriod=()=>globalThis.__optionsPeriod;");
  await writeFile(resolve(folder,'finance.ts'),'// @ts-nocheck\n'+source);
  const finance=await import(pathToFileURL(resolve(folder,'finance.ts')).href);
  source=await readFile('app/api/records/route.ts','utf8');
  source=source.replace("'@/lib/finance-store'","'./finance.ts'")
   .replace("import {authorize,canAccess} from '@/lib/auth';","const canAccess=(user,view)=>user.permissions.includes(view),authorize=async(request,views)=>{const user={id:'qa-monthly',displayName:'Teste',permissions:(request.headers.get('x-test-access')??'monthly').split(',')};return views.some(view=>canAccess(user,view))?{user,error:null}:{user:null,error:Response.json({error:'Sem acesso'},{status:403})}};")
   .replace(/'@\/lib\/([^']+)'/g,"'../../lib/$1.ts'");
  await writeFile(resolve(folder,'route.ts'),'// @ts-nocheck\n'+source);
  const api=await import(pathToFileURL(resolve(folder,'route.ts')).href);
  const deletion=(input,access='monthly',requestOrigin=origin)=>api.DELETE(new Request(origin+'/api/records',{method:'DELETE',headers:{origin:requestOrigin,'Content-Type':'application/json','x-test-access':access},body:JSON.stringify(input)}));
  let all=await finance.getRecords();assert.ok(all.some(r=>r.id==='import-90-2'&&r.status==='overdue'));assert.ok(all.some(r=>r.client==='Bruno'&&r.period==='2026-11'));
  const input={id:'import-90-2',version:0,confirmation:'EXCLUIR'};
  assert.equal((await deletion(input,'services')).status,403);
  assert.equal((await deletion(input,'monthly','https://other.example')).status,403);
  assert.equal((await deletion({...input,confirmation:'sim'})).status,400);
  assert.equal((await deletion({...input,id:'import-90-5'})).status,400);
  await raw.prepare('INSERT INTO finance_changes(id,data,version,updated_at) VALUES (?,?,1,?)').bind(input.id,JSON.stringify({...records[1],amount:31000,version:1}),'now').run();
  assert.equal((await deletion(input)).status,409);
  assert.equal((await raw.prepare("SELECT id FROM operation_changes WHERE entity='monthlyCancellation'").all()).results.length,0);
  const response=await deletion({...input,version:1});assert.equal(response.status,200);
  const payload=await response.json();assert.ok(payload.records.every(r=>r.kind==='Mensalidade'));
  assert.ok(payload.records.some(r=>r.id==='import-90-1'&&r.status==='paid'));
  assert.ok(!payload.records.some(r=>['import-90-2','import-90-3'].includes(r.id)));
  all=await finance.getRecords();assert.ok(all.some(r=>r.id==='import-90-5'));
  const rule=await raw.prepare("SELECT data,id FROM operation_changes WHERE entity='monthlyCancellation'").first();
  assert.equal(JSON.parse(rule.data).record.amount,31000);assert.equal(JSON.parse(rule.data).period,'2026-10');
  assert.equal((await deletion(input)).status,200);
  const forbidden=await api.POST(new Request(origin+'/api/records',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({...records[1],version:1,status:'paid'})}));assert.equal(forbidden.status,410);
  globalThis.__optionsPeriod='2026-12';globalThis.__optionsDay='2026-12-11';
  all=await finance.getRecords();assert.ok(all.some(r=>r.client==='Bruno'&&r.period==='2026-12'&&r.status==='overdue'));assert.ok(all.some(r=>r.client==='Anabela'&&r.period==='2026-12'));
  assert.ok(!all.some(r=>r.kind==='Mensalidade'&&r.client.trim().toLowerCase()==='ana'&&r.period>='2026-10'));
  assert.ok(!(await raw.prepare("SELECT data FROM finance_changes WHERE json_extract(data,'$.client')='Ana' AND json_extract(data,'$.period')='2026-12'").all()).results.length);
  assert.equal((await raw.prepare('SELECT data FROM finance_changes WHERE id=?').bind(input.id).first()).data,JSON.stringify({...records[1],amount:31000,version:1}));
  const events=(await raw.prepare("SELECT actor_id FROM audit_events WHERE entity='monthlyCancellation'").all()).results;assert.deepEqual(events.map(e=>e.actor_id),['qa-monthly']);
  await mf.dispose();mf=new Miniflare(options);raw=await mf.getD1Database('DB');globalThis.__optionsRaw=raw;
  all=await finance.getRecords();assert.ok(!all.some(r=>r.id==='import-90-2'||r.id==='import-90-3'));assert.ok(all.some(r=>r.id==='import-90-1'));assert.ok(all.some(r=>r.id==='import-90-5'));
 }finally{await mf.dispose();for(const key of ['__optionsRaw','__optionsBase','__optionsDay','__optionsPeriod','__optionsOriginals'])delete globalThis[key];await rm(folder,{recursive:true,force:true})}
});

test('overdue follows São Paulo midnight, preserves paid/review, and follows changed due dates',()=>{
 const row={kind:'Mensalidade',date:'2026-11-04',status:'pending'};
 assert.equal(monthlyPaymentStatus(row,businessToday(new Date('2026-11-05T02:59:59Z'))),'pending');
 assert.equal(monthlyPaymentStatus(row,businessToday(new Date('2026-11-05T03:00:00Z'))),'overdue');
 assert.equal(monthlyPaymentStatus({...row,status:'paid'},'2026-12-01'),'paid');
 assert.equal(monthlyPaymentStatus({...row,status:'review'},'2026-12-01'),'review');
 assert.equal(monthlyPaymentStatus({...row,status:'overdue',date:'2026-12-10'},'2026-12-01'),'pending');
 assert.equal(monthlyPaymentStatus({...row,date:''},'2026-12-01'),'pending');
 assert.equal(monthlyPaymentStatus({...row,kind:'Serviço'},'2026-12-01'),'pending');
});
