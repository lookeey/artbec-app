import {monthlyCancellations,monthlyCancelled} from '@/lib/monthly-billing';
import {billingKey} from '@/lib/annual-adjustments';
import {calendarDate,serviceExecutionFields,validServiceExecution} from '@/lib/service-execution';
import {z} from 'zod';
import {database,getRecords,originals} from '@/lib/finance-store';
import {authorize,canAccess} from '@/lib/auth';
const amount=z.number().int().min(0).max(99999999900).nullable();
const schema=z.object({id:z.string().regex(/^(import-\d+-\d+|new-[0-9a-f-]{36})$/),version:z.number().int().min(0),kind:z.enum(['Mensalidade','Serviço']),...serviceExecutionFields,period:z.string().regex(/^(\d{4}-(0[1-9]|1[012])|sem-data)$/),client:z.string().trim().min(1).max(200),date:calendarDate,amount,net:amount,payment:z.string().max(500),description:z.string().max(1000),netNote:z.string().max(1000),status:z.enum(['paid','pending','overdue','review'])}).refine(validServiceExecution,{message:'Informe a data da realização.',path:['serviceDate']});
export async function GET(request:Request){const auth=await authorize(request,['overview','monthly','services','growth','history']);if(auth.error)return auth.error;try{const rows=await getRecords(),user=auth.user!,records=rows.filter(record=>record.kind==='Mensalidade'?['overview','monthly','growth','history'].some(view=>canAccess(user,view)):['overview','services'].some(view=>canAccess(user,view)));return Response.json({records},{headers:{'Cache-Control':'no-store'}})}catch(e){console.error('Finance read failed',e);return Response.json({error:'O armazenamento está temporariamente indisponível.'},{status:503})}}
export async function POST(request:Request){
const auth=await authorize(request,['monthly','services']);if(auth.error)return auth.error;
if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Formato inválido.'},{status:415});
try{
 const raw=await request.text();if(raw.length>15000)return Response.json({error:'Lançamento muito extenso.'},{status:413});
 const result=schema.safeParse(JSON.parse(raw));if(!result.success)return Response.json({error:'Confira cliente, datas e valores antes de salvar.'},{status:400});
 const input=result.data,db=database(auth.user!);
 const existing=await db.prepare('SELECT data,version FROM finance_changes WHERE id=?').bind(input.id).first<{data:string;version:number}>();
 const original=originals.get(input.id);if(!original&&!existing&&input.id.startsWith('import-'))return Response.json({error:'Lançamento não encontrado.'},{status:404});
 const current=existing?JSON.parse(existing.data):original;
 if(!canAccess(auth.user!,input.kind==='Mensalidade'?'monthly':'services')||(current&&!canAccess(auth.user!,current.kind==='Mensalidade'?'monthly':'services')))return Response.json({error:'Você não tem acesso a esta área.'},{status:403});
 if(monthlyCancelled(current??input,await monthlyCancellations(db)))return Response.json({error:'Este cliente foi retirado das mensalidades a partir desta competência.'},{status:410});
 if(current&&current.kind!==input.kind)return Response.json({error:'O tipo do lançamento não pode ser alterado.'},{status:409});
 if((existing?.version??0)!==input.version)return Response.json({error:'Este lançamento mudou em outra janela. Recarregue a página antes de editar.'},{status:409});
 const record={dateNote:'',amountNote:'',sourceStatus:'',profit:null,...current,...input,billingDay:input.kind==='Mensalidade'?(Number(input.date.slice(8,10))||current?.billingDay):undefined,source:current?.source??'Cadastro no site',sourceRow:current?.sourceRow??0,kind:current?.kind??input.kind,version:input.version+1};
 const saved=await db.prepare('INSERT INTO finance_changes (id,data,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE finance_changes.version=? RETURNING id').bind(record.id,JSON.stringify(record),record.version,new Date().toISOString(),input.version).run<{id:string}>();
 if(!saved.results.some(row=>row.id===record.id))return Response.json({error:'O lançamento mudou. Recarregue a página e tente novamente.'},{status:409});
 return Response.json({record},{headers:{'Cache-Control':'no-store'}});
}catch(e){console.error('Finance write failed',e);return Response.json({error:'Não foi possível salvar. Os dados do formulário foram mantidos.'},{status:503})}}

const deletion=z.object({id:z.string().regex(/^(import-\d+-\d+|new-[0-9a-f-]{36})$/),version:z.number().int().min(0),confirmation:z.literal('EXCLUIR')}).strict();
export async function DELETE(request:Request){
 const auth=await authorize(request,['monthly']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{
  const raw=await request.text();if(raw.length>1000)return Response.json({error:'Pedido muito extenso.'},{status:413});
  const parsed=deletion.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confirme a exclusão da mensalidade.'},{status:400});
  const input=parsed.data,db=database(auth.user!);
  const existing=await db.prepare('SELECT data,version FROM finance_changes WHERE id=?').bind(input.id).first<{data:string;version:number}>();
  const current=existing?JSON.parse(existing.data):originals.get(input.id);
  if(!current)return Response.json({error:'Mensalidade não encontrada.'},{status:404});
  if(current.kind!=='Mensalidade'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(current.period))return Response.json({error:'Escolha uma mensalidade com competência definida.'},{status:400});
  if(monthlyCancelled(current,await monthlyCancellations(db)))return GET(request);
  if((existing?.version??0)!==input.version)return Response.json({error:'A mensalidade foi alterada. Confira os dados e tente excluir novamente.'},{status:409});
  const clientKey=billingKey(current.client),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(clientKey+'|'+current.period));
  const id='monthlyCancellation-'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),now=new Date().toISOString();
  // Preserve the full source record and stop this billing name from the chosen
  // month onward. The version guard also covers edits made during this request.
  const data={id,clientKey,client:current.client,period:current.period,recordId:input.id,record:{...current,version:input.version},at:now,actorId:auth.user!.id,actorName:auth.user!.displayName};
  const saved=await db.prepare("INSERT OR IGNORE INTO operation_changes(id,entity,data,version,deleted,updated_at) SELECT ?,'monthlyCancellation',?,1,0,? WHERE COALESCE((SELECT version FROM finance_changes WHERE id=?),0)=? RETURNING id").bind(id,JSON.stringify(data),now,input.id,input.version).run<{id:string}>();
  if(!saved.results.some(row=>row.id===id))return Response.json({error:'A mensalidade foi alterada. Confira os dados e tente excluir novamente.'},{status:409});
  return GET(request);
 }catch(error){console.error('Monthly cancellation failed',error);return Response.json({error:'Não foi possível excluir a mensalidade. Tente novamente.'},{status:503})}
}
