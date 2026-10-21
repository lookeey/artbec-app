import {AuvoClient} from '@/lib/auvo/client';
import {actorFrom,adminOnly,validJson} from '@/lib/auvo/access';
import {audit,getStoredCredentials,replaceCustomers} from '@/lib/auvo/store';
import type {AuvoCustomer} from '@/lib/auvo/types';
import {safeError} from '@/lib/auvo/security';

export async function POST(request:Request){const denied=await adminOnly(request);if(denied)return denied;if(!validJson(request))return Response.json({error:'Origem ou formato inválido.'},{status:403});try{const client=new AuvoClient(await getStoredCredentials()),customers=await client.listAll<AuvoCustomer>('/customers',{},50,100),saved=await replaceCustomers(customers,new Date().toISOString());await audit(actorFrom(request),'auvo.customers.updated',{saved});return Response.json({saved})}catch(error){return Response.json({error:safeError(error)},{status:502})}}
