import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {emptyProfitabilityAdjustment,profitabilityAdjustmentSchema} from '@/lib/profitability-adjustments';

const query=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)});
export async function GET(request:Request){
 const auth=await authorize(request,['profitability']);if(auth.error)return auth.error;
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return Response.json({error:'Competência inválida.'},{status:400});
 try{const row=await database().prepare("SELECT data,version FROM operation_changes WHERE id=? AND entity='profitabilityAdjustment' AND deleted=0").bind(`profitability-${parsed.data.period}`).first<{data:string;version:number}>();if(!row)return Response.json({adjustments:emptyProfitabilityAdjustment(parsed.data.period)},{headers:{'Cache-Control':'no-store'}});const saved=profitabilityAdjustmentSchema.safeParse({...JSON.parse(row.data),version:row.version});return saved.success?Response.json({adjustments:saved.data},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Os ajustes salvos estão inválidos.'},{status:503})}catch{return Response.json({error:'Não foi possível carregar os ajustes manuais.'},{status:503})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['profitability']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode editar os ajustes.'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const raw=await request.text();if(raw.length>200000)return Response.json({error:'Ajustes muito extensos.'},{status:413});const parsed=profitabilityAdjustmentSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confira valores, visitas e horas antes de salvar.'},{status:400});const input=parsed.data;if(input.id!==`profitability-${input.period}`)return Response.json({error:'Competência inválida.'},{status:400});
  const db=database(auth.user!),row=await db.prepare('SELECT entity,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<{entity:string;version:number;deleted:number}>();if(row&&(row.entity!=='profitabilityAdjustment'||row.deleted))return Response.json({error:'Os ajustes não estão disponíveis.'},{status:409});if((row?.version??0)!==input.version)return Response.json({error:'Os ajustes mudaram em outra tela. Tente salvar novamente.'},{status:409});
  const saved={...input,version:input.version+1},result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'profitabilityAdjustment',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,deleted=0,updated_at=excluded.updated_at WHERE operation_changes.entity='profitabilityAdjustment' AND operation_changes.version=? RETURNING id").bind(saved.id,JSON.stringify(saved),saved.version,new Date().toISOString(),input.version).run<{id:string}>();if(!result.results.some(item=>item.id===saved.id))return Response.json({error:'Os ajustes mudaram em outra tela. Tente salvar novamente.'},{status:409});return Response.json({adjustments:saved},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível salvar os ajustes manuais.'},{status:503})}
}
