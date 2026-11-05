import {z} from 'zod';
import {database,getNotes,originalNotes} from '@/lib/finance-store';
import {authorize} from '@/lib/auth';
const day=z.number().int().min(1).max(31).nullable();
const schema=z.object({id:z.string().regex(/^(note-\d+|note-new-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i),version:z.number().int().min(0),amount:z.number().int().min(0).max(99999999900).nullable().optional(),client:z.string().trim().min(1).max(200),serviceDay:day,dueDay:day,requiresInvoice:z.boolean(),requiresBoleto:z.boolean(),requiresInss:z.boolean(),requiresEmail:z.boolean(),monthly:z.record(z.string(),z.boolean()),source:z.string().max(100),sourceRow:z.number().int().min(0)});
const noteId=z.string().regex(/^(note-\d+|note-new-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
const patchSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('requirement'),id:noteId,key:z.enum(['requiresInvoice','requiresBoleto','requiresInss','requiresEmail']),value:z.boolean()}),
 z.object({action:z.literal('monthly'),id:noteId,period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),value:z.boolean()}),
]);
export async function GET(request:Request){const auth=await authorize(request,['notes']);if(auth.error)return auth.error;try{return Response.json({notes:await getNotes()},{headers:{'Cache-Control':'no-store'}})}catch(e){console.error('Note read failed',e);return Response.json({error:'O controle de notas está temporariamente indisponível.'},{status:503})}}
export async function POST(request:Request){
 const auth=await authorize(request,['notes']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Formato inválido.'},{status:415});
 try{
  const raw=await request.text();if(raw.length>3000)return Response.json({error:'Atualização muito extensa.'},{status:413});
  const body=JSON.parse(raw) as unknown,patch=patchSchema.safeParse(body),db=database(auth.user!);
  if(patch.success){
   const update=patch.data;
   for(let attempt=0;attempt<3;attempt++){
    const existing=await db.prepare('SELECT data,version FROM note_changes WHERE id=?').bind(update.id).first<{data:string;version:number}>(),original=originalNotes.get(update.id);
    if(!original&&!existing)return Response.json({error:'Controle de nota não encontrado.'},{status:404});
    const current={...(original??{}),...(existing?JSON.parse(existing.data):{}),id:update.id,version:existing?.version??0} as z.infer<typeof schema>;
    const note=update.action==='monthly'?{...current,monthly:{...current.monthly,[update.period]:update.value}}:{...current,[update.key]:update.value};
    const version=current.version+1,saved=await db.prepare('INSERT INTO note_changes (id,data,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE note_changes.version=? RETURNING id').bind(note.id,JSON.stringify({...note,version}),version,new Date().toISOString(),current.version).run<{id:string}>();
    if(saved.results.some(row=>row.id===note.id))return Response.json({note:{...note,version}},{headers:{'Cache-Control':'no-store'}});
   }
   return Response.json({error:'Não foi possível salvar agora. Tente novamente.'},{status:409});
  }
  const result=schema.safeParse(body);if(!result.success)return Response.json({error:'Atualização de nota inválida.'},{status:400});
  const input=result.data;
  const existing=await db.prepare('SELECT data,version FROM note_changes WHERE id=?').bind(input.id).first<{data:string;version:number}>();
  const original=originalNotes.get(input.id);if(!original&&!existing&&!input.id.startsWith('note-new-'))return Response.json({error:'Controle de nota não encontrado.'},{status:404});
  if((existing?.version??0)!==input.version)return Response.json({error:'Este controle mudou em outra janela. Recarregue a página.'},{status:409});
  const note={...input,version:input.version+1};
  const saved=await db.prepare('INSERT INTO note_changes (id,data,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE note_changes.version=? RETURNING id').bind(note.id,JSON.stringify(note),note.version,new Date().toISOString(),input.version).run<{id:string}>();
  if(!saved.results.some(row=>row.id===note.id))return Response.json({error:'Este controle foi atualizado em outra tela. Tente salvar novamente.'},{status:409});
  return Response.json({note},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Note write failed',e);return Response.json({error:'Não foi possível atualizar a nota.'},{status:503})}
}
