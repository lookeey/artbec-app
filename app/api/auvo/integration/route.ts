import {z} from 'zod';
import {AuvoClient,clearAuvoToken} from '@/lib/auvo/client';
import {actorFrom,adminOnly,isAdmin,validJson} from '@/lib/auvo/access';
import {authorize} from '@/lib/auth';
import {audit,disconnectIntegration,getStoredCredentials,integrationSummary,listAuvoUsers,listMappings,saveCredentials} from '@/lib/auvo/store';
import {getManagement} from '@/lib/management-store';
import {safeError} from '@/lib/auvo/security';

const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('test'),apiKey:z.string().trim().max(500).optional(),apiToken:z.string().trim().max(500).optional()}),
 z.object({action:z.literal('connect'),apiKey:z.string().trim().min(1).max(500),apiToken:z.string().trim().min(1).max(500)}),
 z.object({action:z.literal('disconnect')}),
]);
export async function GET(request:Request){const auth=await authorize(request,['performance']);if(auth.error)return auth.error;try{const [integration,users,mappings,management]=await Promise.all([integrationSummary(),listAuvoUsers(),listMappings(),getManagement()]);return Response.json({...integration,admin:await isAdmin(request),users,technicians:management.staff.filter(person=>person.role==='Técnico').map(person=>({id:person.id,name:person.name})),mappings},{headers:{'Cache-Control':'no-store'}})}catch{console.error('Auvo integration read failed');return Response.json({error:'Não foi possível carregar a configuração do Auvo.'},{status:503})}}
export async function POST(request:Request){const denied=await adminOnly(request);if(denied)return denied;if(!validJson(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{const parsed=bodySchema.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Confira os dados informados.'},{status:400});const actor=actorFrom(request),input=parsed.data;if(input.action==='disconnect'){await disconnectIntegration();clearAuvoToken();await audit(actor,'auvo.integration.disconnected');return Response.json({ok:true})}const credentials=input.apiKey&&input.apiToken?{apiKey:input.apiKey,apiToken:input.apiToken}:await getStoredCredentials();await new AuvoClient(credentials).test();await audit(actor,'auvo.integration.tested',{result:'success'});if(input.action==='connect'){await saveCredentials(credentials);clearAuvoToken();await audit(actor,'auvo.integration.configured');}return Response.json({ok:true})}catch(error){await audit(actorFrom(request),'auvo.integration.test_failed',{message:safeError(error)}).catch(()=>{});return Response.json({error:safeError(error)},{status:502})}}
