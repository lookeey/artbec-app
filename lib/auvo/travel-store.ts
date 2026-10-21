import {database} from '@/lib/finance-store';
import type {TravelVisit} from './travel-metrics';
export async function travelVisits(userId:number,date:string){
 // Legacy arrival/departure columns come from check-in/out, not verified real times.
 const rows=(await database().prepare('SELECT t.auvo_id as id,COALESCE(c.name,\'Cliente não identificado\') as name,t.task_date as taskDate,NULL as arrivalDate,NULL as departureDate FROM auvo_tasks t LEFT JOIN auvo_customers c ON c.auvo_id=t.customer_id WHERE t.auvo_user_id=? AND substr(t.task_date,1,10)=? ORDER BY t.task_date,t.auvo_id').bind(userId,date).all<TravelVisit>()).results;
 const overrides=await travelRead<{visits:{id:number;arrivalDate:string|null;departureDate:string|null}[]}>(`auvo-travel-times-${userId}-${date}`,'auvoTravelTimes');
 return rows.map(row=>({...row,...overrides?.data.visits.find(v=>v.id===row.id)}));
}
export async function travelRead<T>(id:string,entity:string){const row=await database().prepare('SELECT data,version FROM operation_changes WHERE id=? AND entity=? AND deleted=0').bind(id,entity).first<{data:string;version:number}>();return row?{data:JSON.parse(row.data) as T,version:row.version}:null}
export async function travelSave(id:string,entity:string,data:unknown,version:number){const result=await database().prepare('INSERT INTO operation_changes(id,entity,data,version,deleted,updated_at) VALUES(?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,deleted=0,updated_at=excluded.updated_at WHERE operation_changes.entity=excluded.entity AND operation_changes.version=?').bind(id,entity,JSON.stringify(data),version+1,new Date().toISOString(),version).run();if(!result.meta.changes)throw new Error('Os dados mudaram em outro acesso. Atualize a tela e tente novamente.')}
