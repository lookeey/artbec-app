import source from '@/data/operations.json';
import {database} from '@/lib/finance-store';
import type {SaleItem} from '@/app/operations-panel';
import type {PayrollItem} from '@/app/operations-panel';
import {currentPeriod} from '@/lib/month-rollover';
import {payrollRollover} from '@/lib/payroll-rollover';

export type OperationEntity='price'|'sale'|'academyInvoice'|'expenseTechnician'|'stockMovement'|'fuel'|'oil'|'stock'|'bike'|'maintenance'|'payroll'|'process'|'vitaClosing';
const fields:Record<OperationEntity,string>={price:'prices',sale:'sales',academyInvoice:'academyInvoices',expenseTechnician:'expenseTechnicians',stockMovement:'stockMovements',fuel:'fuel',oil:'oil',stock:'stock',bike:'bikes',maintenance:'maintenance',payroll:'payroll',process:'processes',vitaClosing:'vitaClosings'};
export const originalOperations=Object.fromEntries(Object.entries(fields).map(([entity,key])=>[entity,new Map((((source as unknown as Record<string,{id:string}[]>)[key]??[])).map(item=>[item.id,item]))])) as Record<OperationEntity,Map<string,unknown>>;

export async function getOperations(){
 const result={prices:[...source.prices],sales:[...source.sales],academyInvoices:[...source.academyInvoices],expenseTechnicians:[...source.expenseTechnicians],stockMovements:[...source.stockMovements],fuel:[...source.fuel],oil:[...source.oil],stock:[...source.stock],bikes:[...source.bikes],maintenance:[...source.maintenance],payroll:[...source.payroll],processes:[...source.processes],vitaClosings:[] as Record<string,unknown>[]};
 const maps=Object.fromEntries(Object.entries(fields).map(([entity,key])=>[entity,new Map((result[key as keyof typeof result] as {id:string}[]).map(item=>[item.id,item]))])) as Record<OperationEntity,Map<string,unknown>>;
 const db=database();
 const read=()=>db.prepare('SELECT id,entity,data,version,deleted FROM operation_changes').all<{id:string;entity:OperationEntity|'payrollRollover'|'productAgendaReset';data:string;version:number;deleted:number}>();
 const saved=await read();
 const merge=(rows:typeof saved.results)=>{for(const row of rows){if(row.entity==='payrollRollover'||row.entity==='productAgendaReset')continue;const map=maps[row.entity];if(!map)continue;if(row.deleted)map.delete(row.id);else map.set(row.id,{...(map.get(row.id) as Record<string,unknown>|undefined),...JSON.parse(row.data),version:row.version})}};
 merge(saved.results);
 const agendaExcludedSaleIds=saved.results.filter(row=>row.entity==='productAgendaReset'&&!row.deleted).flatMap(row=>{const data=JSON.parse(row.data) as {excludedSaleIds?:unknown};return Array.isArray(data.excludedSaleIds)?data.excludedSaleIds.filter((id):id is string=>typeof id==='string'):[]});
 const completed=saved.results.filter(row=>row.entity==='payrollRollover'&&!row.deleted).map(row=>(JSON.parse(row.data) as {period:string}).period);
 const months=await payrollRollover([...maps.payroll.values()] as PayrollItem[],completed,currentPeriod());
 for(const month of months){
  const now=new Date().toISOString();
  // Stable IDs and insert-only writes protect manual changes and concurrent opens.
  const statements=month.items.map(item=>db.prepare('INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,\'payroll\',?,1,0,?)').bind(item.id,JSON.stringify(item),now));
  statements.push(db.prepare('INSERT OR IGNORE INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,\'payrollRollover\',?,1,0,?)').bind(`payroll-month-${month.period}`,JSON.stringify({period:month.period}),now));
  for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50));
 }
 if(months.length)merge((await read()).results);
 return {agendaExcludedSaleIds,sourceName:source.sourceName,prices:[...maps.price.values()],growth:source.growth,partnerPeriods:source.partnerPeriods,productSummaries:source.productSummaries,payrollMeta:source.payrollMeta,sales:[...maps.sale.values()].map(item=>({deliveryStatus:'delivered',deliveryDate:(item as Record<string,unknown>).date??'',deliveredAt:'',deliveryWeekday:'',stockItems:[],payment:'',billingClient:'',billingDueDay:null,...(item as Record<string,unknown>)})) as unknown as SaleItem[],academyInvoices:[...maps.academyInvoice.values()],expenseTechnicians:[...maps.expenseTechnician.values()],stockMovements:[...maps.stockMovement.values()],fuel:[...maps.fuel.values()],oil:[...maps.oil.values()],stock:[...maps.stock.values()],bikes:[...maps.bike.values()],maintenance:[...maps.maintenance.values()],payroll:[...maps.payroll.values()],processes:[...maps.process.values()],vitaClosings:[...maps.vitaClosing.values()]};
}
