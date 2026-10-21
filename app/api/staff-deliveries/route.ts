import {z} from 'zod';
import {authorize,canAccess} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {getManagement} from '@/lib/management-store';
import {businessToday} from '@/lib/month-rollover';
import {staffDeliverySchema,realDeliveryDate,type StaffDelivery} from '@/lib/staff-deliveries';
const envelope=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),item:staffDeliverySchema}).strict(),
 z.object({action:z.literal('return'),id:z.string().uuid(),staffId:z.string().max(200),version:z.number().int().min(1),returnedOn:z.string().refine(realDeliveryDate)}).strict(),
 z.object({action:z.literal('delete'),id:z.string().uuid(),staffId:z.string().max(200),version:z.number().int().min(1)}).strict(),
]);
async function access(request:Request,staffId:string){const auth=await authorize(request,['technicians','administrative']);if(auth.error)return {error:auth.error};const staff=(await getManagement()).staff.find(s=>s.id===staffId);if(!staff)return {error:Response.json({error:'Funcionário não encontrado.'},{status:404})};if(!canAccess(auth.user!,staff.role==='Técnico'?'technicians':'administrative'))return {error:Response.json({error:'Você não tem acesso a esta equipe.'},{status:403})};return {user:auth.user!,staff}}
export async function GET(request:Request){
 try{const staffId=new URL(request.url).searchParams.get('staffId')??'',auth=await access(request,staffId);if(auth.error)return auth.error;
 const rows=await database().prepare("SELECT data,version FROM operation_changes WHERE entity='staffDelivery' AND deleted=0 AND json_extract(data,'$.staffId')=? ORDER BY updated_at DESC").bind(staffId).all<{data:string;version:number}>();
 return Response.json({items:rows.results.map(r=>({...JSON.parse(r.data),version:r.version}))},{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'Não foi possível carregar as entregas.'},{status:503})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['technicians','administrative']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem inválida.'},{status:403});
 try{const raw=await request.text();if(raw.length>8000)return Response.json({error:'Registro muito extenso.'},{status:413});const parsed=envelope.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confira os campos, datas e quantidade.'},{status:400});
 const input=parsed.data,staffId=input.action==='save'?input.item.staffId:input.staffId,permission=await access(request,staffId);if(permission.error)return permission.error;
 const db=database(auth.user!),id='staffDelivery-'+(input.action==='save'?input.item.id:input.id),version=input.action==='save'?input.item.version:input.version,row=await db.prepare('SELECT entity,data,version,deleted FROM operation_changes WHERE id=?').bind(id).first<{entity:string;data:string;version:number;deleted:number}>();
 if(row&&(row.entity!=='staffDelivery'||row.deleted||JSON.parse(row.data).staffId!==staffId)||(!row&&version!==0)||(row?.version??0)!==version)return Response.json({error:'Este registro mudou. Atualize as entregas.'},{status:409});
 const previous=row?JSON.parse(row.data) as StaffDelivery:null,now=new Date().toISOString(),today=businessToday();
 if(input.action==='delete'){const result=await db.prepare("UPDATE operation_changes SET deleted=1,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted=0").bind(now,id,version).run();return result.meta.changes===1?Response.json({ok:true}):Response.json({error:'Registro alterado.'},{status:409})}
 let item:StaffDelivery;
 if(input.action==='return'){
 if(!previous||previous.returnedOn||input.returnedOn<previous.deliveredOn||input.returnedOn>today)return Response.json({error:'Confira a data de devolução.'},{status:400});
 item={...previous,returnedOn:input.returnedOn,version:version+1,updatedAt:now,updatedBy:auth.user!.displayName};
 }else{
 if(input.item.deliveredOn>today||previous?.returnedOn&&input.item.deliveredOn>previous.returnedOn)return Response.json({error:'Confira a data da entrega.'},{status:400});
 item={...input.item,id,staffName:permission.staff!.name,version:version+1,returnedOn:previous?.returnedOn??'',createdBy:previous?.createdBy??auth.user!.displayName,createdAt:previous?.createdAt??now,updatedBy:auth.user!.displayName,updatedAt:now};
 }
 const result=await db.prepare("INSERT INTO operation_changes(id,entity,data,version,deleted,updated_at) VALUES (?,'staffDelivery',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE operation_changes.entity='staffDelivery' AND operation_changes.deleted=0 AND operation_changes.version=?").bind(id,JSON.stringify(item),item.version,now,version).run();
 return result.meta.changes===1?Response.json({item}):Response.json({error:'Registro alterado por outra pessoa. Atualize.'},{status:409});
 }catch{return Response.json({error:'Não foi possível salvar a entrega.'},{status:503})}
}
