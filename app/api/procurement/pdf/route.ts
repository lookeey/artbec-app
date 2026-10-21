import {authorize} from '@/lib/auth';
import {purchaseId} from '@/lib/procurement';
import {readPurchase} from '@/lib/procurement-store';
import {renderProcurementPdf} from '@/lib/procurement-pdf';
export async function GET(request:Request){const auth=await authorize(request,['quotes']);if(auth.error)return auth.error;try{const id=new URL(request.url).searchParams.get('id')??'';if(!purchaseId.safeParse(id).success)return Response.json({error:'Cotação inválida.'},{status:400});const p=await readPurchase(id);if(!p)return Response.json({error:'Cotação não encontrada.'},{status:404});const bytes=await renderProcurementPdf(p);return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="artbec-comparativo-${id.slice(9,17)}.pdf"`,'Cache-Control':'no-store'}})}catch{return Response.json({error:'Não foi possível gerar o PDF.'},{status:503})}}
