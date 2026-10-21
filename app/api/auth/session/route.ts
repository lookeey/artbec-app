import {authorize} from '@/lib/auth';
export async function GET(request:Request){const auth=await authorize(request);if(auth.error)return auth.error;return Response.json({user:auth.user},{headers:{'Cache-Control':'private, no-store'}})}
