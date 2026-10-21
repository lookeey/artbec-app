import {env} from 'cloudflare:workers';
import {authorize} from '@/lib/auth';

const bucket=()=>((env as unknown) as {DOCUMENTS:R2Bucket}).DOCUMENTS;
const validKey=(key:string)=>/^quote-images\/quote-[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(key);

export async function GET(request:Request){
 const auth=await authorize(request,['quotes']);if(auth.error)return auth.error;
 const key=new URL(request.url).searchParams.get('key')??'';if(!validKey(key))return new Response('Imagem inválida.',{status:400});
 try{const file=await bucket().get(key);if(!file)return new Response('Imagem não encontrada.',{status:404});return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType??'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}catch(error){console.error('Quote image read failed',error);return new Response('Imagem indisponível.',{status:503})}
}

export async function POST(request:Request){
 const auth=await authorize(request,['quotes']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
 try{const form=await request.formData(),file=form.get('file'),quoteId=String(form.get('quoteId')??'');if(!(file instanceof File)||!/^quote-[0-9a-f-]{36}$/i.test(quoteId)||!['image/png','image/jpeg'].includes(file.type)||file.size>5_000_000||!file.size)return Response.json({error:'Envie uma foto JPG ou PNG de até 5 MB.'},{status:400});const key=`quote-images/${quoteId}/${crypto.randomUUID()}.${file.type==='image/png'?'png':'jpg'}`;await bucket().put(key,file.stream(),{httpMetadata:{contentType:file.type}});return Response.json({key})}catch(error){console.error('Quote image upload failed',error);return Response.json({error:'Não foi possível enviar a foto.'},{status:503})}
}
