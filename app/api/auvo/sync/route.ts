import {z} from 'zod';
import {actorFrom,adminOnly,validJson} from '@/lib/auvo/access';
import {syncAuvo} from '@/lib/auvo/sync';
import {safeError} from '@/lib/auvo/security';
const schema=z.object({startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),scope:z.enum(['users','tasks','all']).optional(),userId:z.number().int().positive().optional()});
export async function POST(request:Request){const denied=await adminOnly(request);if(denied)return denied;if(!validJson(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Período inválido.'},{status:400});return Response.json(await syncAuvo(actorFrom(request),parsed.data.startDate,parsed.data.endDate,parsed.data.scope,parsed.data.userId))}catch(error){return Response.json({error:safeError(error)},{status:503})}}
