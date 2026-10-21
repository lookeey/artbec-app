import {authorize} from '@/lib/auth';
import {getTeamPerformance} from '@/lib/auvo/performance';
import {performanceQuery} from '@/lib/auvo/performance-query';
import {renderPerformancePdf} from '@/lib/performance-pdf';

export async function GET(request:Request){const auth=await authorize(request,['performance']);if(auth.error)return auth.error;try{const parsed=performanceQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return Response.json({error:'Selecione um período válido de até 366 dias.'},{status:400});const {start,end,technicianId}=parsed.data,report=await getTeamPerformance({start,end},technicianId),pdf=await renderPerformancePdf(report.insights);return new Response(pdf as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="artbec-desempenho-${start}-${end}.pdf"`,'Cache-Control':'no-store'}})}catch(error){console.error('Performance PDF failed',error);return Response.json({error:'Não foi possível gerar o relatório em PDF.'},{status:503})}}
