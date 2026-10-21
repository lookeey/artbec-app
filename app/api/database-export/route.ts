import {database} from '@/lib/finance-store';
import {authorizeAdmin} from '@/lib/auth';
import {createBusinessDump} from '@/lib/security-backup-store';
export async function GET(request:Request){const auth=await authorizeAdmin(request);if(auth.error)return auth.error;try{const {body}=await createBusinessDump(database(),auth.user!);return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="artbec-d1-'+new Date().toISOString().slice(0,10)+'.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(error){console.error('Database export failed',error);return Response.json({error:'Não foi possível exportar o banco de dados.'},{status:503})}}
