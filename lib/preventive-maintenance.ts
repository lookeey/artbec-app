export type MaintenancePlan={id:string;version:number;clientId:string;clientName:string;title:string;kind:'sand'|'pump'|'other';firstDueDate:string;frequencyMonths:number;owner:string;notes:string;active:boolean};
export type MaintenanceOccurrence={id:string;planId:string;clientName:string;title:string;kind:MaintenancePlan['kind'];dueDate:string;owner:string;done:boolean;completedAt:string};

export function occurrenceDate(firstDueDate:string,frequencyMonths:number,index:number){
 const [year,month,day]=firstDueDate.split('-').map(Number);
 const firstOfMonth=new Date(Date.UTC(year,month-1+frequencyMonths*index,1));
 const lastDay=new Date(Date.UTC(firstOfMonth.getUTCFullYear(),firstOfMonth.getUTCMonth()+1,0)).getUTCDate();
 return `${firstOfMonth.getUTCFullYear()}-${String(firstOfMonth.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
export function generateOccurrences(plans:MaintenancePlan[],completed:Map<string,string>,through:string){
 const result:MaintenanceOccurrence[]=[];
 for(const plan of plans){if(!plan.active||!plan.firstDueDate||!plan.frequencyMonths)continue;
  for(let index=0;index<240;index++){
   const dueDate=occurrenceDate(plan.firstDueDate,plan.frequencyMonths,index);if(dueDate>through)break;
   const id=`maintenanceOccurrence-${plan.id.slice('maintenancePlan-'.length)}-${dueDate}`;
   result.push({id,planId:plan.id,clientName:plan.clientName,title:plan.title,kind:plan.kind,dueDate,owner:plan.owner,done:completed.has(id),completedAt:completed.get(id)??''});
  }
 }
 return result.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.clientName.localeCompare(b.clientName,'pt-BR'));
}
