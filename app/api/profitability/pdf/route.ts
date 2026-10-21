import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {getProfitability} from '@/lib/profitability';
import {renderProfitabilityPdf} from '@/lib/profitability-pdf';

const query=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),technician:z.string().max(100).default('all'),q:z.string().max(200).default('')});
export async function GET(request:Request){
 const auth=await authorize(request,['profitability']);if(auth.error)return auth.error;
 try{
  const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)return Response.json({error:'Filtros inválidos.'},{status:400});
  const {period,technician,q}=parsed.data,report=await getProfitability(period);
  if(technician!=='all'&&!report.technicians.some(person=>person.technicianId===technician))return Response.json({error:'Colaborador não encontrado neste período.'},{status:404});
  const pdf=await renderProfitabilityPdf(report,technician,q);
  return new Response(pdf as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="artbec-rentabilidade-${period}.pdf"`,'Cache-Control':'no-store'}});
 }catch(error){console.error('Profitability PDF failed',error);return Response.json({error:'Não foi possível gerar o PDF. Tente novamente.'},{status:503})}
}
