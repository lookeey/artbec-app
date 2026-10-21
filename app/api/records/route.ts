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
 if(current&&current.kind!==input.kind)return Response.json({error:'O tipo do lançamento não pode ser alterado.'},{status:409});
 if((existing?.version??0)!==input.version)return Response.json({error:'Este lançamento mudou em outra janela. Recarregue a página antes de editar.'},{status:409});
 const record={dateNote:'',amountNote:'',sourceStatus:'',profit:null,...current,...input,billingDay:input.kind==='Mensalidade'?(Number(input.date.slice(8,10))||current?.billingDay):undefined,source:current?.source??'Cadastro no site',sourceRow:current?.sourceRow??0,kind:current?.kind??input.kind,version:input.version+1};
 const saved=await db.prepare('INSERT INTO finance_changes (id,data,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE finance_changes.version=?').bind(record.id,JSON.stringify(record),record.version,new Date().toISOString(),input.version).run();
 if(saved.meta.changes!==1)return Response.json({error:'O lançamento mudou. Recarregue a página e tente novamente.'},{status:409});
 return Response.json({record},{headers:{'Cache-Control':'no-store'}});
}catch(e){console.error('Finance write failed',e);return Response.json({error:'Não foi possível salvar. Os dados do formulário foram mantidos.'},{status:503})}}
