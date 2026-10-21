import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {REVIEW_ITEMS,REVIEW_PERIOD,reviewItems,reviewId} from '@/lib/monthly-review';
const schema=z.object({period:z.string().regex(REVIEW_PERIOD),key:z.enum(REVIEW_ITEMS.map(i=>i.key) as [typeof REVIEW_ITEMS[number]['key'],...typeof REVIEW_ITEMS[number]['key'][]]),version:z.number().int().min(0),done:z.boolean(),note:z.string().trim().max(2000)}).strict();
export async function GET(request:Request){
 const auth=await authorize(request,['monthly-review']);if(auth.error)return auth.error;
 const period=new URL(request.url).searchParams.get('period')??'';if(!REVIEW_PERIOD.test(period))return Response.json({error:'Mês inválido.'},{status:400});
 try{const rows=await database().prepare('SELECT data,version FROM monthly_reviews WHERE period=?').bind(period).all<{data:string;version:number}>();return Response.json({period,items:reviewItems(rows.results)},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Não foi possível carregar a conferência.'},{status:503})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['monthly-review']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Origem inválida.'},{status:403});
 try{const raw=await request.text();if(raw.length>6000)return Response.json({error:'Observação muito extensa.'},{status:413});const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confira os dados da conferência.'},{status:400});
 const input=parsed.data,id=reviewId(input.period,input.key),db=database(auth.user!),old=await db.prepare('SELECT data,version FROM monthly_reviews WHERE id=?').bind(id).first<{data:string;version:number}>();
 if((old?.version??0)!==input.version)return Response.json({error:'Outra pessoa atualizou esta etapa. Atualize antes de continuar.'},{status:409});
 const previous=old?JSON.parse(old.data):null,now=new Date().toISOString(),item={...input,id,version:input.version+1,checkedBy:input.done?(previous?.done?previous.checkedBy:auth.user!.displayName):'',checkedAt:input.done?(previous?.done?previous.checkedAt:now):'',updatedBy:auth.user!.displayName,updatedAt:now};
 const result=await db.prepare('INSERT INTO monthly_reviews(id,period,data,version,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE monthly_reviews.version=?').bind(id,input.period,JSON.stringify(item),item.version,now,input.version).run();
 if(result.meta.changes!==1)return Response.json({error:'Esta etapa mudou. Atualize a conferência.'},{status:409});
 return Response.json({item},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Não foi possível salvar a conferência.'},{status:503})}
}
