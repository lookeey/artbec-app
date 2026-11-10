import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {billingCloseSchema} from '@/lib/profitability-billing';

export async function POST(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode fechar o mês.'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const raw=await request.text();if(raw.length>2000)return Response.json({error:'Pedido inválido.'},{status:413});const parsed=billingCloseSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Competência inválida.'},{status:400});const input=parsed.data,id=`billing-close-${input.period}`,db=database(auth.user!),row=await db.prepare("SELECT entity,version,deleted FROM operation_changes WHERE id=?").bind(id).first<{entity:string;version:number;deleted:number}>();
  if(row&&(row.entity!=='profitabilityBillingClose'||row.deleted))return Response.json({error:'O fechamento não está disponível.'},{status:409});if((row?.version??0)!==input.version)return Response.json({error:'O fechamento mudou em outra tela. Atualize e tente novamente.'},{status:409});
  const saved={id,period:input.period,closed:input.closed,closedAt:input.closed?new Date().toISOString():null},version=input.version+1;let result;
  if(row)result=await db.prepare("UPDATE operation_changes SET data=?,version=?,deleted=0,updated_at=? WHERE id=? AND entity='profitabilityBillingClose' AND version=? AND deleted=0 RETURNING id").bind(JSON.stringify(saved),version,new Date().toISOString(),id,input.version).run<{id:string}>();
  else if(input.version!==0)return Response.json({error:'O fechamento não existe mais.'},{status:409});
  else result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'profitabilityBillingClose',?,?,0,?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(id,JSON.stringify(saved),version,new Date().toISOString()).run<{id:string}>();
  if(!result.results.some(item=>item.id===id))return Response.json({error:'O fechamento mudou em outra tela. Atualize e tente novamente.'},{status:409});return Response.json({closed:saved.closed,closedAt:saved.closedAt,version},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Profitability billing close failed',error);return Response.json({error:'Não foi possível atualizar o fechamento.'},{status:503})}
}
