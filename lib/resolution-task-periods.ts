import {businessToday,currentPeriod,nextPeriod} from './month-rollover.ts';
import type {ResolutionTask} from './resolution-task.ts';
export const validTaskPeriod=(value:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function taskPeriod(task:Pick<ResolutionTask,'period'|'createdAt'>,fallback=currentPeriod()):string{
 if(task.period&&validTaskPeriod(task.period))return task.period;
 const date=new Date(task.createdAt);return Number.isFinite(date.getTime())?businessToday(date).slice(0,7):fallback;
}
export async function carriedTaskId(root:string,period:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`resolution-task|${root}|${period}`));
 const hex=[...new Uint8Array(digest)].slice(0,16).map(value=>value.toString(16).padStart(2,'0')).join('');
 return 'resolutionTask-'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export async function resolutionTaskRollover(items:ResolutionTask[],protectedIds:Set<string>,target:string,now:string){
 if(!validTaskPeriod(target))throw Error('Mês das tarefas inválido');
 const families=new Map<string,ResolutionTask[]>();
 for(const item of items){const root=item.recurrenceRootId||item.id;families.set(root,[...(families.get(root)??[]),{...item,period:taskPeriod(item,target)}]);}
 const copies:{item:ResolutionTask;parent:ResolutionTask}[]=[];
 for(const [root,family] of families){
  const months=new Map(family.map(item=>[item.period!,item]));let previous=family.filter(item=>item.period!<=target).sort((a,b)=>a.period!.localeCompare(b.period!)).at(-1);
  for(let index=0;previous&&previous.period!<target&&index<240;index++){
   const period=nextPeriod(previous.period!),existing=months.get(period);
   if(existing){previous=existing;continue;}
   if(previous.status!=='open')break;
   const id=await carriedTaskId(root,period);if(protectedIds.has(id))break;
   const item:ResolutionTask={...previous,id,period,recurrenceRootId:root,carriedFrom:previous.id,carriedFromPeriod:previous.period,version:1,status:'open',steps:previous.steps.map(step=>({...step})),resolution:'',createdAt:now,updatedAt:now,resolvedAt:'',resolvedBy:''};
   copies.push({item,parent:previous});months.set(period,item);protectedIds.add(id);previous=item;
  }
 }
 return copies;
}
