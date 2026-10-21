import {historyUsers} from './history';
import {buildPerformanceInsights,previousPeriod,shiftDay,recordedMinutes} from './insights';
import {database} from '@/lib/finance-store';
import {AUVO_TASK_STATUS_LABELS,AuvoTaskStatus} from './types';
import {calculateMetrics} from './metrics';

type TaskRow={auvoId:number;auvoUserId:number|null;userName:string|null;customerId:number|null;customerName:string|null;taskTypeDescription:string|null;taskDate:string;taskStatus:number;arrivalDate:string|null;departureDate:string|null;durationMinutes:number|null};
type UserRow={auvoId:number;name:string};
export type Period={start:string;end:string};

function timingMetrics(tasks:TaskRow[]){
 const durations=tasks.filter(task=>task.taskStatus===AuvoTaskStatus.Finished).map(recordedMinutes).filter((value):value is number=>typeof value==='number'&&value>0&&value<=1440);
 return {
  timingSamples:durations.length,
  averageMinutes:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):null,
  fastestMinutes:durations.length?Math.min(...durations):null,
  slowestMinutes:durations.length?Math.max(...durations):null,
 };
}

export async function getTeamPerformance(period:Period,technicianId?:string|null){
 const previous=previousPeriod(period),historyStart=[previous.start,shiftDay(period.start,-180)].sort()[0];
 const db=database(),selectedAuvoUser=technicianId?Number(technicianId):undefined,[taskResult,userResult]=await Promise.all([
  db.prepare('SELECT t.auvo_id as auvoId,t.auvo_user_id as auvoUserId,u.name as userName,t.customer_id as customerId,c.name as customerName,t.task_type_description as taskTypeDescription,t.task_date as taskDate,t.task_status as taskStatus,t.arrival_date as arrivalDate,t.departure_date as departureDate,t.duration_minutes as durationMinutes FROM auvo_tasks t LEFT JOIN auvo_users u ON u.auvo_id=t.auvo_user_id LEFT JOIN auvo_customers c ON c.auvo_id=t.customer_id WHERE substr(t.task_date,1,10)>=? AND substr(t.task_date,1,10)<=? ORDER BY t.task_date DESC').bind(historyStart,period.end).all<TaskRow>(),
  db.prepare('SELECT auvo_id as auvoId,name FROM auvo_users ORDER BY name COLLATE NOCASE').all<UserRow>(),
 ]),allRows=taskResult.results.filter(task=>task.taskDate.slice(0,10)>=period.start),rows=selectedAuvoUser&&Number.isFinite(selectedAuvoUser)?allRows.filter(task=>task.auvoUserId===selectedAuvoUser):allRows,summary=calculateMetrics(rows),technicianRows=historyUsers(userResult.results,allRows).map(user=>{const tasks=allRows.filter(task=>task.auvoUserId===user.auvoId);return {technicianId:String(user.auvoId),name:user.name,linked:true,auvoUserId:user.auvoId,...calculateMetrics(tasks),...timingMetrics(tasks)}}).filter(user=>user.scheduled>0),ranking=technicianRows.filter(user=>user.averageMinutes!==null).sort((a,b)=>(a.averageMinutes??0)-(b.averageMinutes??0)),byDay=new Map<string,{date:string;scheduled:number;finished:number}>();
 for(const task of rows){const day=task.taskDate.slice(0,10),entry=byDay.get(day)??{date:day,scheduled:0,finished:0};entry.scheduled++;if(task.taskStatus===AuvoTaskStatus.Finished)entry.finished++;byDay.set(day,entry)}
 const series=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)),status=Object.entries(AUVO_TASK_STATUS_LABELS).map(([value,label])=>({status:Number(value),label,count:rows.filter(task=>task.taskStatus===Number(value)).length})).filter(item=>item.count),tasks=rows.map(task=>({id:task.auvoId,date:task.taskDate,customer:task.customerName??(task.customerId?`Cliente #${task.customerId}`:'Não informado'),service:task.taskTypeDescription??'Tarefa Auvo',status:AUVO_TASK_STATUS_LABELS[task.taskStatus]??`Status ${task.taskStatus}`,technician:task.userName??'Não informado',arrivalDate:task.arrivalDate,departureDate:task.departureDate,durationMinutes:recordedMinutes(task)}));
 return {insights:buildPerformanceInsights(taskResult.results,period,technicianId),period,summary,technicians:technicianRows,durationRanking:ranking,fastestTechnician:ranking[0]??null,slowestTechnician:ranking.at(-1)??null,series,status,tasks,totalTasks:rows.length,formula:'Tempo médio = intervalo entre o horário de chegada e o horário de saída registrados no Auvo. Apenas atendimentos com os dois horários válidos entram no cálculo.'};
}
