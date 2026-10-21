import {clearSessionCookie,cookieToken,logout} from '@/lib/auth';
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});await logout(cookieToken(request));return Response.json({ok:true},{headers:{'Set-Cookie':clearSessionCookie(),'Cache-Control':'no-store'}})}
