import {database,getRecords} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {getManagement} from '@/lib/management-store';
import {emptyProfitabilityAdjustment,profitabilityAdjustmentSchema,profitabilityCustomerKey} from '@/lib/profitability-adjustments';
import {monthlyClientCount} from '@/lib/monthly-client-count';
import {billingEntrySchema} from '@/lib/profitability-billing';
import {allocateBillingCosts,type CostField} from '@/lib/profitability-billing-costs';

type Payroll={employee:string;period:string;baseSalary:number;hazardPay:number;overtime:number;bonus:number;inss:number;absences:number;advance:number;loan:number;fines:number;advance15:number};
type Expense={technician:string;date:string;amount:number|null};
type Maintenance={driver:string;date:string;amount:number|null};
type Staff={id:string;name:string;role:string;endDate?:string;source?:string};
type Client={customerId:number|null;name:string;visits:number;timedVisits:number;minutes:number;effectiveMinutes:number;revenue:number;monthlyRevenue:number;revenueMatched:boolean;averageMinutes:number|null;allocatedCost:number;profit:number;margin:number|null;technicianIds:string[];technicians:string[];manual:{visits:boolean;hours:boolean;revenue:boolean;technicians:boolean}};

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const firstName=(value:string)=>normalize(value).split(' ')[0]??'';
const matchPerson=(source:string,target:string)=>{const a=normalize(source),b=normalize(target);return !!a&&!!b&&(a===b||firstName(a)===firstName(b))};
const round=(value:number)=>Math.round(value);
const validMinutes=(value:number|null)=>typeof value==='number'&&value>0&&value<=720?value:null;
const payrollAmount=(salary:Payroll|undefined)=>salary?Math.max(0,salary.baseSalary+salary.hazardPay+salary.overtime+salary.bonus-salary.absences):0;

const MONTHLY_REFERENCE_MINUTES=176*60;
function findRevenue(name:string,entries:{name:string;key:string;amount:number|null}[]){const key=normalize(name),exact=entries.find(item=>item.key===key);if(exact)return exact;const candidates=entries.filter(item=>item.key.length>=5&&key.length>=5&&(item.key.includes(key)||key.includes(item.key)));return candidates.length===1?candidates[0]:null}

export async function getProfitability(period:string){
 const [records,operations,management]=await Promise.all([getRecords(),getOperations(),getManagement()]);
 const payroll=operations.payroll as Payroll[],fuel=operations.fuel as Expense[],oil=operations.oil as Expense[],maintenance=operations.maintenance as Maintenance[];
 const monthPayroll=payroll.filter(item=>item.period===period),latestPayrollPeriod=[...payroll].map(item=>item.period).sort().at(-1)??period,rosterPayroll=monthPayroll.length?monthPayroll:payroll.filter(item=>item.period===latestPayrollPeriod);
 const staff=(management.staff as Staff[]).filter(person=>!person.endDate&&person.role.toLocaleLowerCase('pt-BR').includes('técnico'));
 const team=staff.flatMap(person=>{
  const aliases=[person.name,...(person.source&&!/^cadastro\b/i.test(person.source)?[person.source]:[])],matched=rosterPayroll.find(item=>aliases.some(alias=>normalize(alias)===normalize(item.employee)))??rosterPayroll.find(item=>aliases.some(alias=>matchPerson(alias,item.employee)));
  const name=matched?.employee??person.name;
  return [{technicianId:person.id,name,aliases:[...new Set([...aliases,name])]}];
 });
 const revenueEntries:{name:string;key:string;amount:number|null}[]=[];
 for(const row of records.filter(item=>item.kind==='Mensalidade'&&item.period===period)){
  const key=normalize(row.client),existing=revenueEntries.find(item=>item.key===key);
  if(existing)existing.amount=existing.amount===null||row.amount===null?null:existing.amount+(row.amount??0);
  else revenueEntries.push({name:row.client,key,amount:row.amount??null});
 }
 const savedAdjustment=await database().prepare("SELECT data,version FROM operation_changes WHERE id=? AND entity='profitabilityAdjustment' AND deleted=0").bind(`profitability-${period}`).first<{data:string;version:number}>(),parsed=savedAdjustment?profitabilityAdjustmentSchema.safeParse({...JSON.parse(savedAdjustment.data),version:savedAdjustment.version}):null,adjustments=parsed?.success?parsed.data:emptyProfitabilityAdjustment(period);
 const customers:Client[]=revenueEntries.map((entry,index)=>{
  const key=profitabilityCustomerKey(entry.name),manual=adjustments.customers[key]??{visits:null,hours:null,revenue:null,technicianIds:[]};
  let assigned=manual.technicianIds.filter(id=>team.some(person=>person.technicianId===id));
  // Bring forward assignments saved by the earlier technician-scoped editor when the client key was its normalized name.
  if(!assigned.length){const legacy=Object.entries(adjustments.customers).find(([oldKey])=>oldKey.endsWith(`:${normalize(entry.name)}`));if(legacy){const oldTechnician=legacy[0].slice(0,legacy[0].lastIndexOf(':'));if(team.some(person=>person.technicianId===oldTechnician))assigned=[oldTechnician];}}
  const visits=manual.visits??0,minutes=manual.hours===null?0:round(manual.hours*60),revenue=manual.revenue??entry.amount??0;
  return {customerId:index+1,name:entry.name,visits,timedVisits:manual.hours===null?0:visits,minutes,effectiveMinutes:minutes,revenue,monthlyRevenue:entry.amount??0,revenueMatched:entry.amount!==null,averageMinutes:manual.hours!==null&&visits?round(minutes/visits):null,allocatedCost:0,profit:0,margin:null,technicianIds:assigned,technicians:assigned.map(id=>team.find(person=>person.technicianId===id)?.name??'').filter(Boolean),manual:{visits:manual.visits!==null,hours:manual.hours!==null,revenue:manual.revenue!==null,technicians:assigned.length>0}};
 });
 const costRows=team.map(person=>{
  const salary=payroll.find(item=>item.period===period&&person.aliases.some(alias=>matchPerson(alias,item.employee))),baseSalary=salary?.baseSalary??0,hazardPay=salary?.hazardPay??0,overtime=salary?.overtime??0,bonus=salary?.bonus??0,absences=salary?.absences??0,grossPay=baseSalary+hazardPay+overtime+bonus,payrollCost=payrollAmount(salary),inss=salary?.inss??0,advance=salary?.advance??0,advance15=salary?.advance15??0,loan=salary?.loan??0,fines=salary?.fines??0,netPay=Math.max(0,payrollCost-inss-loan-fines),remainingPay=Math.max(0,netPay-advance-advance15);
  const fuelCost=fuel.filter(item=>item.date.startsWith(period)&&person.aliases.some(alias=>matchPerson(alias,item.technician))).reduce((sum,item)=>sum+(item.amount??0),0),oilCost=oil.filter(item=>item.date.startsWith(period)&&person.aliases.some(alias=>matchPerson(alias,item.technician))).reduce((sum,item)=>sum+(item.amount??0),0),maintenanceCost=maintenance.filter(item=>item.date.startsWith(period)&&person.aliases.some(alias=>matchPerson(alias,item.driver))).reduce((sum,item)=>sum+(item.amount??0),0);
  const assignedCustomers=customers.filter(customer=>customer.technicianIds.includes(person.technicianId)),visits=assignedCustomers.reduce((sum,item)=>sum+item.visits,0),totalMinutes=assignedCustomers.reduce((sum,item)=>sum+item.minutes,0),availableMinutes=MONTHLY_REFERENCE_MINUTES,directCost=payrollCost+fuelCost+oilCost+maintenanceCost;
  const clientCount=monthlyClientCount(assignedCustomers.map(customer=>customer.name));
  return {...person,visits,clients:clientCount,daysWorked:0,timingSamples:0,timingCoverage:0,averageMinutes:visits&&totalMinutes?round(totalMinutes/visits):null,totalMinutes,serviceHours:Math.round(totalMinutes/6)/10,availableHours:Math.round(availableMinutes/6)/10,utilization:availableMinutes?Math.round(totalMinutes/availableMinutes*1000)/10:0,baseSalary,hazardPay,overtime,bonus,absences,grossPay,inss,advance,advance15,loan,fines,netPay,remainingPay,payrollCost,fuelCost,oilCost,maintenanceCost,directCost,revenue:0,profit:-directCost,margin:null as number|null,costPerVisit:visits?round(directCost/visits):0,costPerClient:clientCount?round(directCost/clientCount):0,costPerRecordedHour:totalMinutes?round(directCost/(totalMinutes/60)):null,revenuePerHour:0,otherCost:0,billingCost:0,payrollMatched:!!salary,customers:[] as Client[],revenueUnassigned:0,manual:{visits:false,hours:false,revenueUnassigned:false,payrollCost:false,fuelCost:false,oilCost:false,maintenanceCost:false,otherCost:false}};
 });
 const teamById=new Map(costRows.map(person=>[person.technicianId,person]));
 const billingRecords=await database().prepare("SELECT data,version FROM operation_changes WHERE entity='profitabilityBillingEntry' AND deleted=0").all<{data:string;version:number}>();
 const billingEntries=billingRecords.results.map(row=>billingEntrySchema.safeParse({...JSON.parse(row.data),version:row.version})).flatMap(result=>result.success?[result.data]:[]).filter(entry=>entry.period===period);
 const clientTechnicians=new Map(customers.map(customer=>[normalize(customer.name),customer.technicianIds]));
 const billing=allocateBillingCosts(billingEntries,costRows,clientTechnicians);
 for(const person of costRows){const allocated=billing.costs.get(person.technicianId);if(!allocated)continue;for(const field of ['payrollCost','fuelCost','oilCost','maintenanceCost'] as CostField[])if(billing.covered.get(field)?.has(person.technicianId))person[field]=allocated[field];person.otherCost=allocated.otherCost;person.billingCost=allocated.billingCost}
 for(const customer of customers){
  const shareCount=customer.technicianIds.length,share=shareCount?Math.floor(customer.revenue/shareCount):0,remainder=shareCount?customer.revenue-share*shareCount:0;
  customer.technicianIds.forEach((id,index)=>{const person=teamById.get(id);if(!person)return;person.revenue+=share+(index===0?remainder:0);person.customers.push({...customer,revenue:share+(index===0?remainder:0),technicians:[person.name]})});
 }
 for(const person of costRows){
  const manual=adjustments.technicians[person.technicianId]??{visits:null,hours:null,weeklyHours:[null,null,null,null,null],revenueUnassigned:null,payrollCost:null,fuelCost:null,oilCost:null,maintenanceCost:null,otherCost:null};
  person.visits=manual.visits??person.visits;const weekly=manual.weeklyHours??[null,null,null,null,null],hasWeeklyHours=weekly.some(value=>value!==null);person.totalMinutes=hasWeeklyHours?round(weekly.reduce<number>((sum,value)=>sum+(value??0),0)*60):manual.hours===null?person.totalMinutes:round(manual.hours*60);person.serviceHours=Math.round(person.totalMinutes/6)/10;person.averageMinutes=person.visits&&person.totalMinutes?round(person.totalMinutes/person.visits):null;
  person.payrollCost=manual.payrollCost??person.payrollCost;person.fuelCost=manual.fuelCost??person.fuelCost;person.oilCost=manual.oilCost??person.oilCost;person.maintenanceCost=manual.maintenanceCost??person.maintenanceCost;person.otherCost+=manual.otherCost??0;person.revenueUnassigned=manual.revenueUnassigned??0;person.revenue+=person.revenueUnassigned;person.directCost=person.payrollCost+person.fuelCost+person.oilCost+person.maintenanceCost+person.otherCost;person.profit=person.revenue-person.directCost;person.margin=person.revenue?Math.round(person.profit/person.revenue*1000)/10:null;person.costPerVisit=person.visits?round(person.directCost/person.visits):0;person.costPerClient=person.clients?round(person.directCost/person.clients):0;person.costPerRecordedHour=person.totalMinutes?round(person.directCost/(person.totalMinutes/60)):null;person.revenuePerHour=person.totalMinutes?round(person.revenue/(person.totalMinutes/60)):0;person.manual={visits:manual.visits!==null,hours:manual.hours!==null||hasWeeklyHours,revenueUnassigned:manual.revenueUnassigned!==null,payrollCost:manual.payrollCost!==null,fuelCost:manual.fuelCost!==null,oilCost:manual.oilCost!==null,maintenanceCost:manual.maintenanceCost!==null,otherCost:manual.otherCost!==null};
 }
 // Allocate each technician's own costs across that technician's assigned clients, while keeping shared-client revenue split equally.
 for(const customer of customers){
  let allocated=0;
  for(const id of customer.technicianIds){const person=teamById.get(id);if(!person)continue;const count=person.customers.length,minutesTotal=person.customers.reduce((sum,item)=>sum+item.effectiveMinutes,0),weight=minutesTotal?customer.effectiveMinutes/minutesTotal:count?1/count:0,clientCost=round(person.directCost*weight);allocated+=clientCost;const row=person.customers.find(item=>item.name===customer.name);if(row){row.allocatedCost=clientCost;row.profit=row.revenue-clientCost;row.margin=row.revenue?Math.round(row.profit/row.revenue*1000)/10:null}}
  customer.allocatedCost=allocated;customer.profit=customer.revenue-allocated;customer.margin=customer.revenue?Math.round(customer.profit/customer.revenue*1000)/10:null;
 }
 const orphanCost=(items:({technician:string;date:string;amount:number|null}|{driver:string;date:string;amount:number|null})[],field:'technician'|'driver')=>items.filter(item=>item.date.startsWith(period)&&!team.some(person=>person.aliases.some(alias=>matchPerson(alias,field==='technician'?'technician' in item?item.technician:'':'driver' in item?item.driver:'')))).reduce((sum,item)=>sum+(item.amount??0),0);
 const unassignedPayroll=billing.covered.get('payrollCost')?.size===team.length?0:monthPayroll.filter(item=>!team.some(person=>person.aliases.some(alias=>matchPerson(alias,item.employee)))).reduce((sum,item)=>sum+payrollAmount(item),0),unassignedFuel=billing.covered.get('fuelCost')?.size===team.length?0:orphanCost(fuel,'technician'),unassignedOil=billing.covered.get('oilCost')?.size===team.length?0:orphanCost(oil,'technician'),unassignedMaintenance=billing.covered.get('maintenanceCost')?.size===team.length?0:orphanCost(maintenance,'driver'),unassignedOperatingCost=unassignedPayroll+unassignedFuel+unassignedOil+unassignedMaintenance;
 costRows.sort((a,b)=>b.profit-a.profit);
 const monthlyRevenue=customers.reduce((sum,item)=>sum+item.revenue,0),manualRevenue=costRows.reduce((sum,item)=>sum+item.revenueUnassigned,0),totalRevenue=monthlyRevenue+manualRevenue,totalCost=costRows.reduce((sum,item)=>sum+item.directCost,0)+unassignedOperatingCost,totalProfit=totalRevenue-totalCost,totalClients=monthlyClientCount(customers.map(item=>item.name)),totalVisits=customers.reduce((sum,item)=>sum+item.visits,0),matchedClients=monthlyClientCount(customers.filter(item=>item.revenueMatched).map(item=>item.name));
 return {period,adjustments,summary:{revenue:totalRevenue,directCost:totalCost,profit:totalProfit,margin:totalRevenue?Math.round(totalProfit/totalRevenue*1000)/10:null,visits:totalVisits,clients:totalClients,averageMinutes:null,costPerVisit:totalVisits?round(totalCost/totalVisits):0,payrollCost:costRows.reduce((sum,item)=>sum+item.payrollCost,0)+unassignedPayroll,fuelCost:costRows.reduce((sum,item)=>sum+item.fuelCost,0)+unassignedFuel,oilCost:costRows.reduce((sum,item)=>sum+item.oilCost,0)+unassignedOil,maintenanceCost:costRows.reduce((sum,item)=>sum+item.maintenanceCost,0)+unassignedMaintenance,otherCost:costRows.reduce((sum,item)=>sum+item.otherCost,0)},quality:{timingCoverage:0,revenueCoverage:totalClients?Math.round(matchedClients/totalClients*1000)/10:100,matchedClients,totalClients,shortVisits:0,unmatchedPayroll:costRows.filter(item=>!item.payrollMatched).map(item=>item.name)},technicians:costRows,customers:customers.sort((a,b)=>b.profit-a.profit),methodology:'Mensalidades formam a receita dos clientes. Custos lançados no faturamento substituem os valores da mesma categoria vindos de folha, gasolina, óleo e manutenção; a gasolina é distribuída conforme o consumo individual registrado. Outros gastos são divididos entre os técnicos quando não há responsável indicado. Descontos das entradas também são custos. Ajustes manuais continuam disponíveis.'};
}
