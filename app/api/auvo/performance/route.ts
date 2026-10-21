import {performanceQuery as query} from '@/lib/auvo/performance-query';
import {getTeamPerformance} from '@/lib/auvo/performance';
import {integrationSummary} from '@/lib/auvo/store';
import {authorize} from '@/lib/auth';

export async function GET(request:Request){const auth=await authorize(request,['performance']);if(auth.error)return auth.error;try{const url=new URL(request.url),parsed=query.safeParse(Object.fromEntries(url.searchParams));if(!parsed.success||parsed.data.start>parsed.data.end)return Response.json({error:'Selecione um período válido de até 366 dias.'},{status:400});const [performance,integration]=await Promise.all([getTeamPerformance({start:parsed.data.start,end:parsed.data.end},parsed.data.technicianId),integrationSummary()]);return Response.json({...performance,integration},{headers:{'Cache-Control':'no-store'}})}catch{console.error('Auvo performance read failed');return Response.json({error:'Não foi possível carregar os indicadores do Auvo.'},{status:503})}}
