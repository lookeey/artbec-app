import {z} from 'zod';
import {AuvoClient} from '@/lib/auvo/client';
import {actorFrom,adminOnly,validJson} from '@/lib/auvo/access';
import {audit,getStoredCredentials,listTasksForTiming,saveTaskTimings} from '@/lib/auvo/store';
import {normalizeTaskTiming,type AuvoTaskTiming} from '@/lib/auvo/types';
import {safeError} from '@/lib/auvo/security';

const bodySchema=z.object({userId:z.number().int().positive(),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});

export async function POST(request:Request){const denied=await adminOnly(request);if(denied)return denied;if(!validJson(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{const parsed=bodySchema.safeParse(await request.json());if(!parsed.success||parsed.data.startDate>parsed.data.endDate)return Response.json({error:'Confira o técnico e o período.'},{status:400});const {userId,startDate,endDate}=parsed.data,ids=await listTasksForTiming(userId,startDate,endDate),client=new AuvoClient(await getStoredCredentials()),timings:AuvoTaskTiming[]=[];for(let index=0;index<ids.length;index+=5){const batch=await Promise.all(ids.slice(index,index+5).map(async item=>normalizeTaskTiming(await client.getTask(item.taskID))));timings.push(...batch)}const updated=await saveTaskTimings(timings);await audit(actorFrom(request),'auvo.timings.updated',{userId,startDate,endDate,requested:ids.length,updated});return Response.json({updated,requested:ids.length})}catch(error){return Response.json({error:safeError(error)},{status:502})}}
