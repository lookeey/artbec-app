import {z} from 'zod';
import {authorizeAdmin} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {businessOriginals} from '@/lib/original-business';
import {RECOVERABLE_ENTITIES,parseBusinessData,recordTitle} from '@/lib/data-security';
import {createSafetyBackup,downloadSafetyBackup,type BackupRow} from '@/lib/security-backup-store';
import {stockAvailability,type SaleForDelivery,type StockForDelivery,type MovementForDelivery} from '@/lib/stock-delivery';
import {getOperations} from '@/lib/operations-store';
type Row={id:string;entity:string;data:string;version:number;deleted:number;updated_at:string};
type Event={sequence:number;source_table:string;record_id:string;entity:string;action:string;before_data:string|null;after_data:string|null;actor_id:string;actor_name:string;at:string};
const tableSchema=z.enum(['management_changes','operation_changes']);
const mutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('backup'),daily:z.boolean()}).strict(),
 z.object({action:z.literal('restore'),table:tableSchema,id:z.string().min(1).max(250),version:z.number().int().min(1),confirmation:z.literal('RESTAURAR')}).strict(),
]);
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
async function recovery(db:D1Database,table:string,row:Row){
 const event=await db.prepare("SELECT before_data FROM audit_events WHERE source_table=? AND record_id=? AND action='deleted' ORDER BY sequence DESC LIMIT 1").bind(table,row.id).first<{before_data:string|null}>();
 const captured=parseBusinessData(event?.before_data??null)??parseBusinessData(row.data);
 const original=businessOriginals.get(table+':'+row.id);
 return {data:captured??original?.data??null,basis:captured?'Última versão preservada':original?'Base importada original':'Conteúdo não disponível'};
}
export async function GET(request:Request){
 const auth=await authorizeAdmin(request);if(auth.error)return auth.error;
 try{
 const db=database(),p=new URL(request.url).searchParams,mode=p.get('mode')??'history';
 if(mode==='backup-download'){const row=await db.prepare('SELECT * FROM safety_backups WHERE id=?').bind(p.get('id')??'').first<BackupRow>();return row?downloadSafetyBackup(row):reply({error:'Backup não encontrado.'},404)}
 if(mode==='backups'){const rows=await db.prepare('SELECT id,created_at,created_by,row_count,table_count,sha256,size FROM safety_backups ORDER BY created_at DESC LIMIT 90').all();return reply({backups:rows.results})}
 const page=Math.max(0,Math.min(100000,Number(p.get('page'))||0)),query=(p.get('q')??'').trim().slice(0,200),entity=(p.get('entity')??'').slice(0,80),from=p.get('from')??'',through=p.get('through')??'';
 if(mode==='trash'){
  const entries=[];
  for(const table of ['management_changes','operation_changes']){
   const rows=await db.prepare("SELECT t.*,(SELECT before_data FROM audit_events a WHERE a.source_table=? AND a.record_id=t.id AND a.action='deleted' ORDER BY sequence DESC LIMIT 1) as captured FROM "+table+' t WHERE deleted=1 ORDER BY updated_at DESC').bind(table).all<Row&{captured:string|null}>();
   for(const row of rows.results){if(!(RECOVERABLE_ENTITIES as readonly string[]).includes(row.entity))continue;if(entity&&row.entity!==entity)continue;const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.updated_at));if(from&&localDay<from||through&&localDay>through)continue;
    const captured=parseBusinessData(row.captured)??parseBusinessData(row.data),original=businessOriginals.get(table+':'+row.id),value={data:captured??original?.data??null,basis:captured?'Última versão preservada':original?'Base importada original':'Conteúdo não disponível'},title=recordTitle(value.data,row.id);
    if(query&&!(title+' '+row.entity+' '+JSON.stringify(value.data)).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))continue;
    entries.push({table,id:row.id,entity:row.entity,version:row.version,deletedAt:row.updated_at,title,...value});
   }
  }
  entries.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));return reply({items:entries.slice(page*30,page*30+30),total:entries.length,page});
 }
 const conditions=['1=1'],args:unknown[]=[];
 if(query){conditions.push("(record_id LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\' OR before_data LIKE ? ESCAPE '\\' OR after_data LIKE ? ESCAPE '\\')");const v='%'+query.replace(/[\\%_]/g,c=>'\\'+c)+'%';args.push(v,v,v,v)}
 if(entity){conditions.push('entity=?');args.push(entity)}
 if(from&&/^\d{4}-\d{2}-\d{2}$/.test(from)){conditions.push("at>=?");args.push(from+"T03:00:00.000Z")}
 if(through&&/^\d{4}-\d{2}-\d{2}$/.test(through)){conditions.push("at<?");const end=new Date(through+"T03:00:00.000Z");end.setUTCDate(end.getUTCDate()+1);args.push(end.toISOString())}
 const where=conditions.join(' AND '),[rows,count]=await Promise.all([db.prepare('SELECT * FROM audit_events WHERE '+where+' ORDER BY sequence DESC LIMIT 30 OFFSET ?').bind(...args,page*30).all<Event>(),db.prepare('SELECT COUNT(*) as n FROM audit_events WHERE '+where).bind(...args).first<{n:number}>()]);
 return reply({items:rows.results.map(e=>({...e,before:parseBusinessData(e.before_data),after:parseBusinessData(e.after_data),before_data:undefined,after_data:undefined})),total:count?.n??0,page});
 }catch(error){console.error('Data security read failed',error);return reply({error:'Não foi possível carregar os dados de segurança.'},503)}
}
export async function POST(request:Request){
 const auth=await authorizeAdmin(request);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return reply({error:'Origem inválida.'},403);
 try{const raw=await request.text();if(raw.length>2000)return reply({error:'Pedido inválido.'},413);const parsed=mutation.safeParse(JSON.parse(raw));if(!parsed.success)return reply({error:'Confirmação inválida.'},400);
 const input=parsed.data,db=database(auth.user!);if(input.action==='backup')return reply({backup:await createSafetyBackup(db,auth.user!,input.daily)});
 const row=await db.prepare('SELECT * FROM '+input.table+' WHERE id=?').bind(input.id).first<Row>();
 if(!row||!row.deleted||row.version!==input.version)return reply({error:'Este registro mudou ou já foi restaurado. Atualize a lixeira.'},409);
 if(!(RECOVERABLE_ENTITIES as readonly string[]).includes(row.entity))return reply({error:'Este registro precisa de recuperação orientada.'},400);
 const {data}=await recovery(db,input.table,row);if(!data)return reply({error:'Não existe uma cópia completa deste registro. Use um backup anterior.'},400);
 let stockStamp:{n:number;v:number}|null=null;
 if(row.entity==='sale'&&data.deliveryStatus==='delivered'||row.entity==='stockMovement'){
  stockStamp=await db.prepare('SELECT COUNT(*) as n,COALESCE(SUM(version),0) as v FROM operation_changes').first<{n:number;v:number}>();
  const operations=await getOperations(),stock=stockAvailability(operations.stock as StockForDelivery[],operations.stockMovements as MovementForDelivery[],operations.sales as SaleForDelivery[]);
  const requested=row.entity==='stockMovement'?[{productId:String(data.productId),quantity:Number(data.quantity)}]:(data.stockItems??[]) as {productId:string;quantity:number}[];
  const quantities=new Map<string,number>();for(const r of requested)quantities.set(r.productId,(quantities.get(r.productId)??0)+r.quantity);
  for(const [id,quantity] of quantities){const current=stock.find(s=>s.id===id);if(!current||quantity>current.available)return reply({error:'A restauração afetaria o estoque sem saldo disponível. Confira o produto antes de restaurar.'},409)}
 }
 const restored={...data,id:row.id,version:row.version+1};delete (restored as Record<string,unknown>).deletedAt;delete (restored as Record<string,unknown>).deletedBy;
 const stockGuard=stockStamp?' AND (SELECT COUNT(*) FROM operation_changes)=? AND (SELECT COALESCE(SUM(version),0) FROM operation_changes)=?':'';
 const result=await db.prepare('UPDATE '+input.table+' SET data=?,version=version+1,deleted=0,updated_at=? WHERE id=? AND entity=? AND version=? AND deleted=1'+stockGuard).bind(JSON.stringify(restored),new Date().toISOString(),row.id,row.entity,input.version,...(stockStamp?[stockStamp.n,stockStamp.v]:[])).run();
 if(result.meta.changes!==1)return reply({error:'O registro mudou. Atualize a lixeira.'},409);
 return reply({ok:true,id:row.id});
 }catch(error){console.error('Data security write failed',error);return reply({error:'Não foi possível concluir. Os dados atuais foram preservados.'},503)}
}
