import {getResolutionTasks} from '@/lib/resolution-task-store';
import {taskPeriod} from '@/lib/resolution-task-periods';
import {getOilMonitors} from '@/lib/oil-monitor-store';
import {authorize,canAccess} from '@/lib/auth';
import {getRecords,database} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {getManagement} from '@/lib/management-store';
import {stockAvailability} from '@/lib/stock-delivery';
import {buildHomeAlerts} from '@/lib/home-alerts';
import {businessToday} from '@/lib/month-rollover';
import {generateOccurrences,type MaintenancePlan} from '@/lib/preventive-maintenance';

export async function GET(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 const user=auth.user!,monthly=canAccess(user,'monthly'),academy=canAccess(user,'academy-sales'),inventory=canAccess(user,'inventory'),delivery=canAccess(user,'product-agenda'),fines=canAccess(user,'fines'),tasks=canAccess(user,'resolution-tasks'),maintenance=canAccess(user,'preventive-maintenance'),complaints=canAccess(user,'complaints'),staffDeliveryAccess=canAccess(user,'technicians')||canAccess(user,'administrative');
 try{
  const [records,operations,management,taskRows,planRows,completionRows,oilMonitors,complaintRows,deliveryRows]=await Promise.all([
   monthly?getRecords():Promise.resolve([]),
   academy||inventory||delivery?getOperations():Promise.resolve(null),
   fines||staffDeliveryAccess?getManagement():Promise.resolve(null),
   tasks?getResolutionTasks(database({id:'system:resolution-task-rollover',displayName:'Repetição mensal das tarefas'})):Promise.resolve(null),
   maintenance?database().prepare("SELECT data FROM operation_changes WHERE entity='maintenancePlan' AND deleted=0 LIMIT 2000").all<{data:string}>():Promise.resolve(null),
   maintenance?database().prepare("SELECT id,data FROM operation_changes WHERE entity='maintenanceOccurrence' AND deleted=0 LIMIT 20000").all<{id:string;data:string}>():Promise.resolve(null),
   canAccess(user,'oil')?getOilMonitors():Promise.resolve(undefined),
   complaints?database().prepare("SELECT data FROM operation_changes WHERE entity='complaint' AND deleted=0").all<{data:string}>():Promise.resolve(null),
   staffDeliveryAccess?database().prepare("SELECT data FROM operation_changes WHERE entity='staffDelivery' AND deleted=0").all<{data:string}>():Promise.resolve(null),
  ]);
  const availability=inventory&&operations?stockAvailability(operations.stock as Parameters<typeof stockAvailability>[0],operations.stockMovements as Parameters<typeof stockAvailability>[1],operations.sales as Parameters<typeof stockAvailability>[2]):[];
  const today=businessToday(),through=new Date(`${today}T12:00:00Z`);through.setUTCDate(through.getUTCDate()+7);
  const completed=new Map((completionRows?.results??[]).filter(row=>{try{return JSON.parse(row.data).done===true}catch{return false}}).map(row=>[row.id,JSON.parse(row.data).completedAt as string]));
  const occurrences=maintenance?generateOccurrences((planRows?.results??[]).map(row=>JSON.parse(row.data) as MaintenancePlan),completed,through.toISOString().slice(0,10)):undefined;
  const staffDeliveries=(deliveryRows?.results??[]).flatMap(row=>{const i=JSON.parse(row.data),person=management?.staff.find(s=>s.id===i.staffId);if(!person||('endDate' in person&&person.endDate))return [];const view=person.role==='Técnico'?'technicians':'administrative';return canAccess(user,view)?[{...i,staffName:person.name,view}]:[]});
  const alerts=buildHomeAlerts({staffDeliveries:staffDeliveryAccess?staffDeliveries:undefined,complaints:complaints?complaintRows?.results.map(row=>JSON.parse(row.data)):undefined,bills:monthly?records:undefined,invoices:academy?operations?.academyInvoices as Parameters<typeof buildHomeAlerts>[0]['invoices']:undefined,stock:inventory?operations?.stock as Parameters<typeof buildHomeAlerts>[0]['stock']:undefined,availability:inventory?availability:undefined,sales:delivery?operations?.sales as Parameters<typeof buildHomeAlerts>[0]['sales']:undefined,fines:fines?management?.fines:undefined,tasks:tasks?taskRows?.filter(task=>taskPeriod(task)===today.slice(0,7)):undefined,maintenance:occurrences,oilMonitors},today);
  return Response.json({alerts,asOf:businessToday()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Home alerts failed',error);return Response.json({error:'Não foi possível carregar os alertas.'},{status:503})}
}
