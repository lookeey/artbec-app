import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {getManagement} from '@/lib/management-store';
import {businessToday} from '@/lib/month-rollover';
import {complaintDeletion,complaintMutation,applyComplaintMutation,type Complaint} from '@/lib/complaints';
const headers={'Cache-Control':'private, no-store'};
type Row={entity:string;data:string;version:number;deleted:number};
export async function GET(request:Request){
 const auth=await authorize(request,['complaints']);if(auth.error)return auth.error;
 try{
  const [rows,management]=await Promise.all([database().prepare("SELECT data,version FROM operation_changes WHERE entity='complaint' AND deleted=0 ORDER BY updated_at DESC").all<{data:string;version:number}>(),getManagement()]);
  return Response.json({complaints:rows.results.map(row=>({...JSON.parse(row.data),version:row.version})),clients:management.customers.map(c=>({id:c.id,name:c.name})),owners:[...new Set(management.staff.filter(p=>!('endDate' in p&&p.endDate)).map(p=>p.name))].sort((a,b)=>a.localeCompare(b,'pt-BR'))},{headers});
 }catch(error){console.error('Complaints read failed',error);return Response.json({error:'Não foi possível carregar as reclamações. Tente novamente.'},{status:503,headers})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['complaints']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403,headers});
 try{
  const raw=await request.text();if(raw.length>15000)return Response.json({error:'Relato muito extenso.'},{status:413,headers});
  let json:unknown;try{json=JSON.parse(raw)}catch{return Response.json({error:'Dados inválidos.'},{status:400,headers})}
  const parsed=complaintMutation.safeParse(json);if(!parsed.success)return Response.json({error:'Confira os campos obrigatórios e as datas.'},{status:400,headers});
  const input=parsed.data,db=database(auth.user!),existing=await db.prepare('SELECT entity,data,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<Row>();
  if((existing&&(existing.entity!=='complaint'||existing.deleted))||(existing?.version??0)!==input.version||(!existing&&input.action!=='save'))return Response.json({error:'Este registro mudou ou não está disponível. Atualize a lista antes de salvar.'},{status:409,headers});
  const previous=existing?{...JSON.parse(existing.data),version:existing.version} as Complaint:null;
  let complaint:Complaint;try{complaint=applyComplaintMutation(previous,input,{id:auth.user!.id,name:auth.user!.displayName},new Date().toISOString(),businessToday(),crypto.randomUUID())}catch(error){return Response.json({error:(error as Error).message},{status:400,headers})}
  if(previous&&complaint.version===previous.version)return Response.json({complaint},{headers});
  const result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'complaint',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE operation_changes.version=? AND operation_changes.entity='complaint' AND operation_changes.deleted=0").bind(complaint.id,JSON.stringify(complaint),complaint.version,complaint.updatedAt,input.version).run();
  if(result.meta.changes!==1)return Response.json({error:'Alguém atualizou esta reclamação. Atualize a lista antes de salvar.'},{status:409,headers});
  return Response.json({complaint},{headers});
 }catch(error){console.error('Complaint write failed',error);return Response.json({error:'Não foi possível salvar a reclamação.'},{status:503,headers})}
}
export async function DELETE(request:Request){
 const auth=await authorize(request,['complaints']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403,headers});
 try{
  const raw=await request.text();if(raw.length>2000)return Response.json({error:'Dados inválidos.'},{status:413,headers});
  let input:unknown;try{input=JSON.parse(raw)}catch{return Response.json({error:'Dados inválidos.'},{status:400,headers})}
  const parsed=complaintDeletion.safeParse(input);if(!parsed.success)return Response.json({error:'Exclusão inválida.'},{status:400,headers});
  const {id,version}=parsed.data,now=new Date().toISOString();
  const result=await database(auth.user!).prepare("UPDATE operation_changes SET data=json_set(data,'$.deletedAt',?,'$.deletedBy',?,'$.version',version+1),deleted=1,version=version+1,updated_at=? WHERE id=? AND entity='complaint' AND version=? AND deleted=0").bind(now,auth.user!.displayName,now,id,version).run();
  if(result.meta.changes!==1)return Response.json({error:'A reclamação mudou ou já foi excluída. Atualize a lista.'},{status:409,headers});
  return Response.json({id},{headers});
 }catch(error){console.error('Complaint deletion failed',error);return Response.json({error:'Não foi possível excluir a reclamação.'},{status:503,headers})}
}
