import {env} from 'cloudflare:workers';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {stockImageMime} from '@/lib/stock-images';
import {attachComplaintPhoto,complaintPhotoKey} from '@/lib/complaint-photos';
import type {Complaint} from '@/lib/complaints';
const bucket=()=>((env as unknown) as {DOCUMENTS:R2Bucket}).DOCUMENTS;
const headers={'Cache-Control':'private, no-store'};
type Row={entity:string;data:string;version:number;deleted:number};
export async function GET(request:Request){
 const auth=await authorize(request,['complaints']);if(auth.error)return auth.error;
 const url=new URL(request.url),key=url.searchParams.get('key')??'';
 if(!complaintPhotoKey(key))return new Response('Foto inválida.',{status:400,headers});
 try{
  const id=key.split('/')[1],row=await database().prepare("SELECT entity,data,version,deleted FROM operation_changes WHERE id=?").bind(id).first<Row>();
  if(!row||row.deleted||row.entity!=='complaint')return new Response('Foto não encontrada.',{status:404,headers});
  const item=JSON.parse(row.data) as Complaint,photo=item.photos?.find(p=>p.key===key);
  if(!photo)return new Response('Foto não encontrada.',{status:404,headers});
  const file=await bucket().get(key);if(!file)return new Response('Foto não encontrada.',{status:404,headers});
  return new Response(file.body,{headers:{'Content-Type':photo.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(url.searchParams.get('download')==='1'?{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(photo.name)}:{})}});
 }catch{return new Response('Não foi possível abrir a foto.',{status:503,headers})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['complaints']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403,headers});
 if(Number(request.headers.get('content-length'))>5_100_000)return Response.json({error:'Envie uma foto de até 5 MB.'},{status:413,headers});
 try{
  const form=await request.formData(),file=form.get('file'),id=String(form.get('complaintId')??''),version=Number(form.get('version'));
  if(!(file instanceof File)||!/^complaint-[0-9a-f-]{36}$/i.test(id)||!Number.isInteger(version)||version<1||!file.size||file.size>5_000_000)return Response.json({error:'Envie uma foto JPG, PNG ou WebP de até 5 MB.'},{status:400,headers});
  const db=database(auth.user!),row=await db.prepare('SELECT entity,data,version,deleted FROM operation_changes WHERE id=?').bind(id).first<Row>();
  if(!row||row.deleted||row.entity!=='complaint')return Response.json({error:'Salve a reclamação antes de adicionar fotos.'},{status:404,headers});
  if(row.version!==version)return Response.json({error:'Esta reclamação mudou. Atualize a lista antes de anexar a foto.'},{status:409,headers});
  const item={...JSON.parse(row.data),version:row.version} as Complaint;
  if(item.archived||(item.photos??[]).length>=10)return Response.json({error:item.archived?'Restaure a reclamação para anexar fotos.':'Limite de 10 fotos por reclamação.'},{status:400,headers});
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=stockImageMime(bytes);if(!mime)return Response.json({error:'O arquivo precisa ser uma foto JPG, PNG ou WebP.'},{status:400,headers});
  const key='complaint-photos/'+id+'/'+crypto.randomUUID()+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'),now=new Date().toISOString(),photo={key,name:file.name.replace(/[\\/\u0000-\u001f\u007f]/g,'_').slice(0,180)||'foto',mime,size:file.size,addedAt:now};
  const saved=attachComplaintPhoto(item,photo,{id:auth.user!.id,name:auth.user!.displayName},now,crypto.randomUUID());
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  try{
   const result=await db.prepare("UPDATE operation_changes SET data=?,version=?,updated_at=? WHERE id=? AND entity='complaint' AND version=? AND deleted=0").bind(JSON.stringify(saved),saved.version,now,id,version).run();
   if(result.meta.changes!==1){await bucket().delete(key);return Response.json({error:'Este registro mudou. Atualize a lista e tente novamente.'},{status:409,headers})}
  }catch(error){await bucket().delete(key);throw error}
  return Response.json({complaint:saved},{headers});
 }catch(error){console.error('Complaint photo upload failed',error);return Response.json({error:'Não foi possível salvar a foto. Tente novamente.'},{status:503,headers})}
}
