import {auditedDatabase} from './audit-database';
import {businessOriginals} from './original-business';
import {env} from 'cloudflare:workers';
import source from '@/data/source.json';
import noteSource from '@/data/notes.json';
import managementSource from '@/data/management.json';
import {billingKey} from '@/lib/annual-adjustments';
import {currentPeriod,nextPeriod,moveDueDate} from '@/lib/month-rollover';
export const originals=new Map(source.records.map(r=>[r.id,r]));
export const originalNotes=new Map(noteSource.notes.map(r=>[r.id,r]));
export const originalFines=new Map(managementSource.fines.map(r=>[r.id,r]));
export function database(actor?:{id:string;displayName:string}){if(!env.DB)throw new Error('Armazenamento indisponível');return actor?auditedDatabase(env.DB,actor,businessOriginals):env.DB}
type StoredRecord=typeof source.records[number]&{serviceStatus?:'unknown'|'pending'|'done';serviceDate?:string;serviceScheduledDate?:string;billingDay?:number;annualAdjustmentId?:string};
export async function getRecords(){
 const db=database();
 const read=async()=>db.prepare('SELECT id, data, version FROM finance_changes').all<{id:string;data:string;version:number}>();
 const saved=await read();
 const items=new Map<string,StoredRecord>(originals as Map<string,StoredRecord>);
 for(const row of saved.results)items.set(row.id,{...JSON.parse(row.data),version:row.version});
 const target=currentPeriod();
 const adjustments=(await db.prepare("SELECT data FROM operation_changes WHERE entity='annualAdjustmentApply' AND deleted=0 ORDER BY updated_at DESC").all<{data:string}>()).results.map(row=>JSON.parse(row.data) as {id:string;period:string;rows:{billingName:string;newAmount:number;include:boolean}[]});
 const months=[...new Set([...items.values()].filter(row=>row.kind==='Mensalidade'&&/^\d{4}-\d{2}$/.test(row.period)).map(row=>row.period))].sort();
 let previous=months.filter(month=>month<target).at(-1);
 if(previous&&previous<target){
  // Uma visita cria competências pendentes até o mês atual. O ID determinístico
  // e INSERT OR IGNORE tornam a geração segura para acessos simultâneos.
  for(let count=0;previous<target&&count<36;count++){
   const period=nextPeriod(previous);
   const templates=[...items.values()].filter(row=>row.kind==='Mensalidade'&&row.period===previous);
   const existing=new Map<string,number>();
   for(const row of items.values())if(row.kind==='Mensalidade'&&row.period===period){const key=row.client.trim().toLocaleLowerCase('pt-BR');existing.set(key,(existing.get(key)??0)+1)}
   const seen=new Map<string,number>();
   const pending:ReturnType<typeof db.prepare>[]=[];
   for(const template of templates){
    const key=template.client.trim().toLocaleLowerCase('pt-BR'),occurrence=(seen.get(key)??0)+1;seen.set(key,occurrence);
    if(occurrence<=(existing.get(key)??0))continue;
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${template.id}|${period}`))).slice(0,16);
    digest[6]=(digest[6]&15)|64;digest[8]=(digest[8]&63)|128;
    const hex=[...digest].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const id=`new-${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const billingDay=template.billingDay??(Number(template.date.slice(8,10))||undefined);
    const adjustment=adjustments.find(a=>a.period<=period&&a.rows.some(r=>r.include&&billingKey(r.billingName)===billingKey(template.client))),price=adjustment?.rows.find(r=>r.include&&billingKey(r.billingName)===billingKey(template.client));
   const applyPrice=!!(adjustment&&price&&template.annualAdjustmentId!==adjustment.id.replace(/-applied$/,'')&&(template.period<adjustment.period||template.status==='paid'));
   const record:StoredRecord={...template,...(applyPrice?{amount:price!.newAmount,annualAdjustmentId:adjustment!.id.replace(/-applied$/,''),amountNote:''}:{}),id,period,date:moveDueDate(template.date,period,billingDay),billingDay,net:null,netNote:'',dateNote:'',amountNote:'',status:'pending',sourceStatus:'',profit:null,source:'Renovação mensal automática',sourceRow:0,version:1};
    pending.push(db.prepare('INSERT OR IGNORE INTO finance_changes (id,data,version,updated_at) VALUES (?,?,?,?)').bind(id,JSON.stringify(record),1,new Date().toISOString()));
    items.set(id,record);
   }
   for(let index=0;index<pending.length;index+=50)await db.batch(pending.slice(index,index+50));
   previous=period;
  }
  // Retorna a versão persistida, inclusive se duas requisições ocorreram juntas.
  const updated=await read();
  for(const row of updated.results)items.set(row.id,{...JSON.parse(row.data),version:row.version});
 }
 return [...items.values()];
}
export async function getNotes(){const saved=await database().prepare('SELECT id, data, version FROM note_changes').all<{id:string;data:string;version:number}>();const items=new Map(originalNotes);for(const row of saved.results)items.set(row.id,{...JSON.parse(row.data),version:row.version});return [...items.values()]}
export async function getFines(){const saved=await database().prepare('SELECT id, data, version FROM fine_changes').all<{id:string;data:string;version:number}>();const items=new Map(originalFines);for(const row of saved.results)items.set(row.id,{...JSON.parse(row.data),version:row.version});return [...items.values()]}
