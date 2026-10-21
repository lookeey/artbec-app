import {database} from '@/lib/finance-store';
import {AuvoClient} from './client';
import {getStoredCredentials,listAuvoUsers,replaceTasks,replaceUsers,startSync,finishSync,failSync,audit} from './store';
import {safeError} from './security';
import type {AuvoUser} from './types';

export async function syncAuvo(actor:string,startDate=`${new Date().getFullYear()}-01-01`,endDate=new Date().toISOString().slice(0,10),scope:'users'|'tasks'|'all'='all',userId?:number){
 const before=(await database().prepare('SELECT COUNT(*) as total FROM auvo_tasks').first<{total:number}>())?.total??0,log=await startSync();await audit(actor,'auvo.sync.started',{syncId:log.id,startDate,endDate,scope,userId:userId??null,before});
 try{const client=new AuvoClient(await getStoredCredentials()),syncedAt=new Date().toISOString();let userCount=0,taskCount=0;
  if(scope==='users'||scope==='all'){const users=await client.listAll<AuvoUser>('/users');userCount=await replaceUsers(users,syncedAt)}
  if(scope==='tasks'||scope==='all'){const users=(await listAuvoUsers()).filter(user=>user.active&&(!userId||user.auvoId===userId));if(userId&&!users.length)throw new Error('Usuário Auvo não encontrado.');for(let index=0;index<users.length;index+=3){const batch=await Promise.all(users.slice(index,index+3).map(user=>client.listTasksForUser(user.auvoId,startDate,endDate)));taskCount+=await replaceTasks(batch.flat(),syncedAt)}}
  const counts={users:userCount,customers:0,tasks:taskCount},finishedAt=await finishSync(log.id,counts);const after=(await database().prepare('SELECT COUNT(*) as total FROM auvo_tasks').first<{total:number}>())?.total??before;await audit(actor,'auvo.sync.completed',{syncId:log.id,...counts,startDate,endDate,scope,userId:userId??null,before,after});return {...counts,before,after,finishedAt}
 }catch(error){const message=safeError(error);await failSync(log.id,message);const after=(await database().prepare('SELECT COUNT(*) as total FROM auvo_tasks').first<{total:number}>())?.total??before;await audit(actor,'auvo.sync.failed',{syncId:log.id,message,startDate,endDate,scope,userId:userId??null,before,after});throw error}
}
