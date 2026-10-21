import {z} from 'zod';
import {database,getFines,originalFines} from '@/lib/finance-store';
import {authorize} from '@/lib/auth';
const schema=z.object({id:z.string().regex(/^fine-\d+$/),version:z.number().int().min(0),status:z.enum(['pending','paid','appeal'])});
export async function GET(request:Request){const auth=await authorize(request,['fines']);if(auth.error)return auth.error;try{return Response.json({fines:await getFines()},{headers:{'Cache-Control':'no-store'}})}catch(e){console.error('Fine read failed',e);return Response.json({error:'O controle de multas está temporariamente indisponível.'},{status:503})}}
export async function POST(request:Request){
 const auth=await authorize(request,['fines']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Formato inválido.'},{status:415});
 try{
  const raw=await request.text();if(raw.length>2000)return Response.json({error:'Atualização muito extensa.'},{status:413});
  const result=schema.safeParse(JSON.parse(raw));if(!result.success)return Response.json({error:'Atualização de multa inválida.'},{status:400});
  const input=result.data,db=database(auth.user!);
  const existing=await db.prepare('SELECT data,version FROM fine_changes WHERE id=?').bind(input.id).first<{data:string;version:number}>();
  const original=originalFines.get(input.id);if(!original&&!existing)return Response.json({error:'Multa não encontrada.'},{status:404});
  const current=existing?JSON.parse(existing.data):original;
  if((existing?.version??0)!==input.version)return Response.json({error:'Esta multa mudou em outra janela. Recarregue a página.'},{status:409});
  const fine={...current,status:input.status,version:input.version+1};
  const saved=await db.prepare('INSERT INTO fine_changes (id,data,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE fine_changes.version=?').bind(fine.id,JSON.stringify(fine),fine.version,new Date().toISOString(),input.version).run();
  if(saved.meta.changes!==1)return Response.json({error:'Esta multa mudou. Recarregue a página.'},{status:409});
  return Response.json({fine},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Fine write failed',e);return Response.json({error:'Não foi possível atualizar a multa.'},{status:503})}
}
