import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {getProfitability} from '@/lib/profitability';

const query=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)});
export async function GET(request:Request){const auth=await authorize(request,['profitability']);if(auth.error)return auth.error;try{const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return Response.json({error:'Período inválido.'},{status:400});return Response.json({...await getProfitability(parsed.data.period),admin:auth.user?.role==='admin'},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Profitability read failed',error);return Response.json({error:'Não foi possível calcular a rentabilidade.'},{status:503})}}
