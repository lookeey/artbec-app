import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {productControlSchema} from '@/lib/product-control';

const valid=(request:Request)=>request.headers.get('origin')===new URL(request.url).origin&&!!request.headers.get('content-type')?.includes('application/json');
const deletion=z.object({id:z.string().regex(/^product-control-[0-9a-f-]{36}$/i),version:z.number().int().min(1)}).strict();

export async function GET(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;
 try{const [rows,operations]=await Promise.all([database().prepare("SELECT data,version FROM operation_changes WHERE entity='productControl' AND deleted=0").all<{data:string;version:number}>(),getOperations()]);
  const items=rows.results.map(row=>productControlSchema.safeParse({...JSON.parse(row.data),version:row.version})).flatMap(result=>result.success?[result.data]:[]);
  const stock=(operations.stock as {product:string}[]).map(item=>item.product).filter(Boolean),prices=(operations.prices as {product:string;price:number|null;kind:string}[]).filter(item=>item.kind==='Revenda'&&item.price!==null).map(item=>({product:item.product,price:item.price!}));
  return Response.json({items,stock:[...new Set(stock)],prices,admin:auth.user?.role==='admin'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Product control read failed',error);return Response.json({error:'Não foi possível carregar o controle dos produtos.'},{status:503})}
}

export async function POST(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode editar os valores.'},{status:403});if(!valid(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const raw=await request.text();if(raw.length>5000)return Response.json({error:'Cadastro muito extenso.'},{status:413});const parsed=productControlSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Confira produto, preços, custo e imposto.'},{status:400});const input=parsed.data,db=database(auth.user!),row=await db.prepare('SELECT entity,version,deleted FROM operation_changes WHERE id=?').bind(input.id).first<{entity:string;version:number;deleted:number}>();if(row&&(row.entity!=='productControl'||row.deleted))return Response.json({error:'Este produto não está disponível.'},{status:409});if((row?.version??0)!==input.version)return Response.json({error:'Os valores mudaram em outra tela. Atualize e tente novamente.'},{status:409});
  const other=await db.prepare("SELECT id FROM operation_changes WHERE entity='productControl' AND deleted=0 AND lower(trim(json_extract(data,'$.product')))=lower(?) AND id<>? LIMIT 1").bind(input.product,input.id).first<{id:string}>();if(other)return Response.json({error:'Este produto já está cadastrado. Edite os valores na linha existente.'},{status:409});
  const saved={...input,version:input.version+1},result=await db.prepare("INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'productControl',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,deleted=0,updated_at=excluded.updated_at WHERE operation_changes.entity='productControl' AND operation_changes.version=? AND operation_changes.deleted=0 RETURNING id").bind(saved.id,JSON.stringify(saved),saved.version,new Date().toISOString(),input.version).run<{id:string}>();if(!result.results.some(item=>item.id===saved.id))return Response.json({error:'Os valores mudaram em outra tela. Atualize e tente novamente.'},{status:409});return Response.json({item:saved},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Product control save failed',error);return Response.json({error:'Não foi possível salvar os valores.'},{status:503})}
}

export async function DELETE(request:Request){
 const auth=await authorize(request,['profitability-billing']);if(auth.error)return auth.error;if(auth.user!.role!=='admin')return Response.json({error:'Somente a administradora pode excluir.'},{status:403});if(!valid(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});
 try{const parsed=deletion.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Produto inválido.'},{status:400});const input=parsed.data,result=await database(auth.user!).prepare("UPDATE operation_changes SET deleted=1,version=version+1,updated_at=? WHERE id=? AND entity='productControl' AND version=? AND deleted=0 RETURNING id").bind(new Date().toISOString(),input.id,input.version).run<{id:string}>();if(!result.results.some(item=>item.id===input.id))return Response.json({error:'O produto mudou em outra tela. Atualize e tente novamente.'},{status:409});return Response.json({ok:true});
 }catch(error){console.error('Product control delete failed',error);return Response.json({error:'Não foi possível excluir este produto.'},{status:503})}
}
