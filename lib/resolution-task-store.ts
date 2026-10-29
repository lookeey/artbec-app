import {currentPeriod} from './month-rollover.ts';
import {resolutionTaskRollover,taskPeriod} from './resolution-task-periods.ts';
import type {ResolutionTask} from './resolution-task.ts';
export async function getResolutionTasks(db:D1Database,target=currentPeriod(),now=new Date().toISOString()):Promise<ResolutionTask[]>{
 const read=()=>db.prepare("SELECT id,data,version,deleted FROM operation_changes WHERE entity='resolutionTask' ORDER BY updated_at DESC").all<{id:string;data:string;version:number;deleted:number}>();
 const decode=(rows:Awaited<ReturnType<typeof read>>['results'])=>rows.filter(row=>!row.deleted).map(row=>{const task={...JSON.parse(row.data),id:row.id,version:row.version} as ResolutionTask;return {...task,period:taskPeriod(task,target)};});
 const rows=await read(),copies=await resolutionTaskRollover(decode(rows.results),new Set(rows.results.map(row=>row.id)),target,now);
 if(copies.length){
  // The parent version/status guard also protects a completion racing the month rollover.
  const writes=copies.map(({item,parent})=>db.prepare("INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) SELECT ?,'resolutionTask',?,1,0,? WHERE EXISTS (SELECT 1 FROM operation_changes WHERE id=? AND entity='resolutionTask' AND version=? AND deleted=0 AND json_extract(data,'$.status')='open')").bind(item.id,JSON.stringify(item),now,parent.id,parent.version));
  // A family's month chain is ordered; if a parent write fails, its children cannot be inserted.
  for(let index=0;index<writes.length;index+=50)await db.batch(writes.slice(index,index+50));
  return decode((await read()).results);
 }
 return decode(rows.results);
}
