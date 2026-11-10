import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database,getRecords} from '@/lib/finance-store';
import {getManagement} from '@/lib/management-store';
import {billingEntrySchema} from '@/lib/profitability-billing';

const query=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)});
const removeSchema=z.object({id:z.string().min(1).max(120),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),version:z.number().int().min(1)}).strict();
const validRequest=(request:Request)=>request.headers.get('origin')===new URL(request.url).origin&&!!request.headers.get('content-type')?.includes('application/json');
const closedPeriod=async(period:string)=>{const row=await database().prepare("SELECT data FROM operation_changes WHERE id=? AND entity='profitabilityBillingClose' AND deleted=0").bind(`billing-close-${period}`).first<{data:string}>();return !!(row&&JSON.parse(row.data).closed)};

export async function GET(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return Response.json({error:'Competência inválida.'},{status:400});
 try{const period=parsed.data.period,db=database(),[rows,close,management,records]=await Promise.all([db.prepare("SELECT id,data,version FROM operation_changes WHERE entity='profitabilityBillingEntry' AND deleted=0").all<{id:string;data:string;version:number}>(),db.prepare("SELECT data,version FROM operation_changes WHERE id=? AND entity='profitabilityBillingClose' AND deleted=0").bind(`billing-close-${period}`).first<{data:string;version:number}>(),getManagement(),getRecords()]);
  const entries=rows.results.map(row=>billingEntrySchema.safeParse({...JSON.parse(row.data),version:row.version})).flatMap(result=>result.success?[result.data]:[]).filter(row=>row.period===period);
  const closeData=close?JSON.parse(close.data) as {closed:boolean;closedAt:string|null}:null;
  const monthly=new Map<string,number>();for(const record of records.filter(item=>item.kind==='Mensalidade'&&item.period===period)){monthly.set(record.client,(monthly.get(record.client)??0)+(record.amount??0))}
  return Response.json({entries,clients:[...new Set(management.customers.map(item=>item.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),monthlyClients:[...monthly].map(([name,amount])=>({name,amount})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),closed:!!closeData?.closed,closedAt:closeData?.closedAt??null,version:close?.version??0,admin:auth.user?.role==='admin'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Profitability billing read failed',error);return Response.json({error:'Não foi possível carregar o faturamento.'},{status:503})}
}

export async function POST(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode editar o faturamento.'},{status:403});
 if(!validRequest(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const raw=await request.text();if(raw.length>10000)return Response.json({error:'Lançamento muito extenso.'},{status:413});const parsed=billingEntrySchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confira data, categoria, descrição e valor.'},{status:400});const input=parsed.data;
  if(input.date.slice(0,7)!==input.period)return Response.json({error:'A data precisa pertencer à competência selecionada.'},{status:400});
  if(new Date(`${input.date}T12:00:00Z`).toISOString().slice(0,10)!==input.date)return Response.json({error:'Data inválida.'},{status:400});
  if(await closedPeriod(input.period))return Response.json({error:'Este mês está fechado. Reabra o mês para fazer alterações.'},{status:409});
  const db=database(auth.user!),row=await db.prepare('SELECT entity,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<{entity:string;version:number;deleted:number}>();
  if(row&&(row.entity!=='profitabilityBillingEntry'||row.deleted))return Response.json({error:'Este lançamento não está disponível.'},{status:409});
  if((row?.version??0)!==input.version)return Response.json({error:'Este lançamento mudou em outra tela. Atualize antes de salvar.'},{status:409});
  const saved={...input,version:input.version+1};let result;
  if(row)result=await db.prepare("UPDATE operation_changes SET data=?,version=?,deleted=0,updated_at=? WHERE id=? AND entity='profitabilityBillingEntry' AND version=? AND deleted=0 RETURNING id").bind(JSON.stringify(saved),saved.version,new Date().toISOString(),saved.id,input.version).run<{id:string}>();
  else if(input.version!==0)return Response.json({error:'Este lançamento não existe mais.'},{status:409});
  else result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'profitabilityBillingEntry',?,?,0,?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(saved.id,JSON.stringify(saved),saved.version,new Date().toISOString()).run<{id:string}>();
  if(!result.results.some(item=>item.id===saved.id))return Response.json({error:'Este lançamento mudou em outra tela. Atualize antes de salvar.'},{status:409});
  return Response.json({entry:saved},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Profitability billing save failed',error);return Response.json({error:'Não foi possível salvar este lançamento.'},{status:503})}
}

export async function DELETE(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode excluir lançamentos.'},{status:403});if(!validRequest(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const parsed=removeSchema.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Lançamento inválido.'},{status:400});const input=parsed.data;if(!input.id.startsWith(`billing-${input.period}-`))return Response.json({error:'Competência inválida.'},{status:400});if(await closedPeriod(input.period))return Response.json({error:'Este mês está fechado. Reabra o mês para fazer alterações.'},{status:409});
  const result=await database(auth.user!).prepare("UPDATE operation_changes SET deleted=1,version=version+1,updated_at=? WHERE id=? AND entity='profitabilityBillingEntry' AND version=? AND deleted=0 RETURNING id").bind(new Date().toISOString(),input.id,input.version).run<{id:string}>();if(!result.results.some(item=>item.id===input.id))return Response.json({error:'O lançamento mudou em outra tela. Atualize e tente novamente.'},{status:409});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Profitability billing delete failed',error);return Response.json({error:'Não foi possível excluir este lançamento.'},{status:503})}
}
