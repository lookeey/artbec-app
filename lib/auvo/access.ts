import {authorizeAdmin} from '@/lib/auth';

export function actorFrom(request:Request){return request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()||'desenvolvimento-local'}
export async function isAdmin(request:Request){return !(await authorizeAdmin(request)).error}
export async function adminOnly(request:Request){return await isAdmin(request)?null:Response.json({error:'Apenas administradores podem alterar a integração Auvo.'},{status:403})}
export function validJson(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('content-type')?.includes('application/json')}
