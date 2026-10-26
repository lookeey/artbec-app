import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';

const areaSchema=z.enum(['payroll','fines']);
const reminderId=z.string().regex(/^areaReminder-(payroll|fines)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const identity=z.object({id:reminderId,version:z.number().int().min(0)});
const inputSchema=identity.extend({text:z.string().trim().min(1).max(4000)});
type Row={entity:string;data:string;version:number;deleted:number};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const valid=(request:Request)=>request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('content-type')?.includes('application/json');
async function access(request:Request){
 const area=areaSchema.safeParse(new URL(request.url).searchParams.get('area'));
 if(!area.success)return {error:reply({error:'Área inválida.'},400),user:null,area:null};
 return {...await authorize(request,[area.data]),area:area.data};
}

export async function GET(request:Request){
 const auth=await access(request);if(auth.error)return auth.error;
 try{
  const rows=await database().prepare("SELECT id,data,version FROM operation_changes WHERE entity='areaReminder' AND deleted=0 AND json_extract(data,'$.area')=? ORDER BY updated_at,id").bind(auth.area).all<{id:string;data:string;version:number}>();
  return reply({reminders:rows.results.map(row=>({...JSON.parse(row.data),id:row.id,version:row.version}))});
 }catch(error){console.error('Area reminders read failed',error);return reply({error:'Não foi possível carregar os lembretes.'},503)}
}

export async function POST(request:Request){
 const auth=await access(request);if(auth.error)return auth.error;
 if(!valid(request))return reply({error:'Origem ou formato inválido.'},403);
 try{
  const raw=await request.text();if(raw.length>12000)return reply({error:'Lembrete muito extenso.'},413);
  let body:unknown;try{body=JSON.parse(raw)}catch{return reply({error:'Formato inválido.'},400)}
  const parsed=inputSchema.safeParse(body);if(!parsed.success)return reply({error:'Escreva um lembrete com até 4.000 caracteres.'},400);
  const input=parsed.data;if(!input.id.startsWith('areaReminder-'+auth.area+'-'))return reply({error:'Este lembrete pertence a outra área.'},403);
  const db=database(auth.user!),existing=await db.prepare('SELECT entity,data,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<Row>();
  if(existing&&(existing.entity!=='areaReminder'||existing.deleted||JSON.parse(existing.data).area!==auth.area)||(existing?.version??0)!==input.version)return reply({error:'Este lembrete mudou em outra janela. Reabra os lembretes para conferir a versão atual.'},409);
  const now=new Date().toISOString(),reminder={...input,area:auth.area,version:input.version+1};
  const result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'areaReminder',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE operation_changes.entity='areaReminder' AND operation_changes.deleted=0 AND operation_changes.version=?")
   .bind(reminder.id,JSON.stringify(reminder),reminder.version,now,input.version).run();
  return result.meta.changes===1?reply({reminder}):reply({error:'Este lembrete mudou em outra janela. Tente novamente após conferir a versão atual.'},409);
 }catch(error){console.error('Area reminder save failed',error);return reply({error:'Não foi possível salvar o lembrete.'},503)}
}

export async function DELETE(request:Request){
 const auth=await access(request);if(auth.error)return auth.error;
 if(!valid(request))return reply({error:'Origem ou formato inválido.'},403);
 try{
  const raw=await request.text();if(raw.length>2000)return reply({error:'Pedido inválido.'},413);
  let body:unknown;try{body=JSON.parse(raw)}catch{return reply({error:'Formato inválido.'},400)}
  const parsed=identity.safeParse(body);if(!parsed.success)return reply({error:'Lembrete inválido.'},400);
  const input=parsed.data;if(!input.id.startsWith('areaReminder-'+auth.area+'-'))return reply({error:'Este lembrete pertence a outra área.'},403);
  const result=await database(auth.user!).prepare("UPDATE operation_changes SET deleted=1,version=version+1,updated_at=? WHERE id=? AND entity='areaReminder' AND deleted=0 AND version=? AND json_extract(data,'$.area')=?")
   .bind(new Date().toISOString(),input.id,input.version,auth.area).run();
  return result.meta.changes===1?reply({id:input.id}):reply({error:'Este lembrete mudou ou já foi excluído. Reabra os lembretes para conferir.'},409);
 }catch(error){console.error('Area reminder delete failed',error);return reply({error:'Não foi possível excluir o lembrete.'},503)}
}
