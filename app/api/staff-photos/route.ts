import {env} from 'cloudflare:workers';
import {authorize,canAccess} from '@/lib/auth';
import {getManagement} from '@/lib/management-store';

const keyPattern=/^staff-photos\/(staff-[a-z0-9-]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const contentTypes:Record<string,string>={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
const bucket=()=>((env as unknown) as {DOCUMENTS:R2Bucket}).DOCUMENTS;

async function permitted(request:Request,staffId:string){
 const auth=await authorize(request,['technicians','administrative']);
 if(auth.error)return {error:auth.error};
 const management=await getManagement();
 const person=management.staff.find(item=>item.id===staffId);
 if(!person)return {error:Response.json({error:'Colaborador não encontrado.'},{status:404})};
 const view=person.role==='Técnico'?'technicians':'administrative';
 if(!canAccess(auth.user!,view))return {error:Response.json({error:'Você não tem acesso a este cadastro.'},{status:403})};
 return {person};
}

function imageMatches(type:string,bytes:Uint8Array){
 if(type==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(type==='image/png')return bytes.slice(0,8).every((value,index)=>value===[137,80,78,71,13,10,26,10][index]);
 if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}

export async function GET(request:Request){
 try{
  const key=new URL(request.url).searchParams.get('key')??'',match=key.match(keyPattern);
  if(!match)return new Response('Foto inválida.',{status:400});
  const access=await permitted(request,match[1]);if(access.error)return access.error;
  if(('photoKey' in access.person! ? access.person.photoKey : '')!==key)return new Response('Foto não encontrada.',{status:404});
  const object=await bucket().get(key);if(!object)return new Response('Foto não encontrada.',{status:404});
  return new Response(object.body,{headers:{'Content-Type':contentTypes[match[2]],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('Staff photo read failed',error);return new Response('Foto indisponível.',{status:503})}
}

export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
  const auth=await authorize(request,['technicians','administrative']);if(auth.error)return auth.error;
  const form=await request.formData(),file=form.get('file'),staffId=String(form.get('staffId')??'');
  if(!/^staff-[a-z0-9-]+$/.test(staffId)||!(file instanceof File)||file.size===0||file.size>5_000_000||!Object.values(contentTypes).includes(file.type))return Response.json({error:'Envie uma foto JPG, PNG ou WebP de até 5 MB.'},{status:400});
  const access=await permitted(request,staffId);if(access.error)return access.error;
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!imageMatches(file.type,bytes))return Response.json({error:'O arquivo enviado não é uma imagem válida.'},{status:400});
  const extension=Object.entries(contentTypes).find(([,type])=>type===file.type)![0];
  const key=`staff-photos/${staffId}/${crypto.randomUUID()}.${extension}`;
  await bucket().put(key,bytes,{httpMetadata:{contentType:file.type}});
  return Response.json({key});
 }catch(error){console.error('Staff photo upload failed',error);return Response.json({error:'Não foi possível salvar a foto.'},{status:503})}
}

export async function DELETE(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem ou formato inválido.'},{status:403});
  const {key}=await request.json() as {key?:string},match=key?.match(keyPattern);
  if(!match)return Response.json({error:'Foto inválida.'},{status:400});
  const access=await permitted(request,match[1]);if(access.error)return access.error;
  // Preserve the object for audited recovery; removing the link hides the photo.
  return Response.json({ok:true});
 }catch(error){console.error('Staff photo delete failed',error);return Response.json({error:'Não foi possível remover a foto.'},{status:503})}
}
