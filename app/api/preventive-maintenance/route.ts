import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {getManagement} from '@/lib/management-store';
import {businessToday} from '@/lib/month-rollover';
import {generateOccurrences,type MaintenancePlan} from '@/lib/preventive-maintenance';

const planId=z.string().regex(/^maintenancePlan-[0-9a-f-]{36}$/i);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value);
const plan=z.object({action:z.literal('plan'),id:planId,version:z.number().int().min(0),clientId:z.string().min(1).max(200),title:z.string().trim().min(3).max(150),kind:z.enum(['sand','pump','other']),firstDueDate:day,frequencyMonths:z.number().int().min(1).max(60),owner:z.string().trim().max(120),notes:z.string().trim().max(1000),active:z.boolean()});
const completion=z.object({action:z.literal('complete'),id:z.string().regex(/^maintenanceOccurrence-[0-9a-f-]{36}-\d{4}-\d{2}-\d{2}$/i),done:z.boolean()});
const valid=(request:Request)=>request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('content-type')?.includes('application/json');
type Row={id:string;data:string;version:number};

async function snapshot(){
 const [management,plans,completed]=await Promise.all([getManagement(),database().prepare("SELECT id,data,version FROM operation_changes WHERE entity='maintenancePlan' AND deleted=0 LIMIT 2000").all<Row>(),database().prepare("SELECT id,data,version FROM operation_changes WHERE entity='maintenanceOccurrence' AND deleted=0 LIMIT 20000").all<Row>()]);
 const clients=management.customers.map(item=>({id:item.id,name:item.name}));
 const activePlans=plans.results.map(row=>({...JSON.parse(row.data),version:row.version}) as MaintenancePlan);
 const completions=new Map(completed.results.filter(row=>{try{return JSON.parse(row.data).done===true}catch{return false}}).map(row=>[row.id,JSON.parse(row.data).completedAt as string]));
 const today=businessToday(),through=new Date(`${today}T12:00:00Z`);through.setUTCDate(through.getUTCDate()+45);
 return {clients,plans:activePlans,occurrences:generateOccurrences(activePlans,completions,through.toISOString().slice(0,10)),today};
}
export async function GET(request:Request){const auth=await authorize(request,['preventive-maintenance']);if(auth.error)return auth.error;try{return Response.json(await snapshot(),{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Preventive maintenance read failed',error);return Response.json({error:'Não foi possível carregar as manutenções.'},{status:503})}}
export async function POST(request:Request){const auth=await authorize(request,['preventive-maintenance']);if(auth.error)return auth.error;if(!valid(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{
 const raw=await request.text();if(raw.length>12000)return Response.json({error:'Dados muito extensos.'},{status:413});
 const value=JSON.parse(raw) as {action?:string};const db=database(auth.user!),now=new Date().toISOString();
 if(value.action==='plan'){
  const parsed=plan.safeParse(value);if(!parsed.success)return Response.json({error:'Confira os campos da manutenção.'},{status:400});const input=parsed.data;
  const management=await getManagement(),client=management.customers.find(item=>item.id===input.clientId);if(!client)return Response.json({error:'Cliente não encontrado.'},{status:400});
  const previous=await db.prepare('SELECT entity,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<{entity:string;version:number;deleted:number}>();
  if(previous&&(previous.entity!=='maintenancePlan'||previous.deleted||previous.version!==input.version))return Response.json({error:'Este plano mudou. Atualize a página.'},{status:409});
  const saved={...input,clientName:client.name,version:input.version+1};
  const result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'maintenancePlan',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE operation_changes.entity='maintenancePlan' AND operation_changes.deleted=0 AND operation_changes.version=?").bind(input.id,JSON.stringify(saved),saved.version,now,input.version).run();
  if(result.meta.changes!==1)return Response.json({error:'Este plano mudou. Atualize a página.'},{status:409});return Response.json({plan:saved});
 }
 const parsed=completion.safeParse(value);if(!parsed.success)return Response.json({error:'Atualização inválida.'},{status:400});
 const planMatch=/^maintenanceOccurrence-([0-9a-f-]{36})-(\d{4}-\d{2}-\d{2})$/i.exec(parsed.data.id)!;
 const parentId=`maintenancePlan-${planMatch[1]}`,parent=await db.prepare("SELECT data FROM operation_changes WHERE id=? AND entity='maintenancePlan' AND deleted=0").bind(parentId).first<{data:string}>();
 if(!parent)return Response.json({error:'Plano não encontrado.'},{status:404});
 const parentData=JSON.parse(parent.data) as MaintenancePlan,possible=generateOccurrences([parentData],new Map(),planMatch[2]);
 if(!possible.some(item=>item.id===parsed.data.id))return Response.json({error:'Data fora do plano.'},{status:400});
 const record={id:parsed.data.id,planId:parentId,done:parsed.data.done,completedAt:parsed.data.done?now:''};
 await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'maintenanceOccurrence',?,1,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=operation_changes.version+1,updated_at=excluded.updated_at").bind(record.id,JSON.stringify(record),now).run();
 return Response.json({record});
 }catch(error){console.error('Preventive maintenance save failed',error);return Response.json({error:'Não foi possível salvar a manutenção.'},{status:503})}}
export async function DELETE(request:Request){const auth=await authorize(request,['preventive-maintenance']);if(auth.error)return auth.error;if(!valid(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{const parsed=z.object({id:planId,version:z.number().int().min(0)}).safeParse(await request.json());if(!parsed.success)return Response.json({error:'Exclusão inválida.'},{status:400});const result=await database(auth.user!).prepare("UPDATE operation_changes SET deleted=1,version=version+1,updated_at=? WHERE id=? AND entity='maintenancePlan' AND version=? AND deleted=0").bind(new Date().toISOString(),parsed.data.id,parsed.data.version).run();if(result.meta.changes!==1)return Response.json({error:'Plano alterado em outra janela.'},{status:409});return Response.json({ok:true})}catch(error){console.error('Preventive maintenance delete failed',error);return Response.json({error:'Não foi possível excluir o plano.'},{status:503})}}
