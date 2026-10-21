import finance from '../data/source.json';
import notes from '../data/notes.json';
import management from '../data/management.json';
import operations from '../data/operations.json';
export type OriginalBusiness={table:string;entity:string;id:string;data:Record<string,unknown>};
const rows:OriginalBusiness[]=[];
function add(table:string,entity:string,items:unknown[]){for(const value of items){const data=value as Record<string,unknown>;rows.push({table,entity,id:String(data.id),data})}}
add('finance_changes','finance',finance.records);add('note_changes','note',notes.notes);add('fine_changes','fine',management.fines);
for(const [entity,field] of Object.entries({client:'customers',staff:'staff',fine:'fines'}))add('management_changes',entity,(management as unknown as Record<string,unknown[]>)[field]);
for(const [entity,field] of Object.entries({price:'prices',sale:'sales',academyInvoice:'academyInvoices',expenseTechnician:'expenseTechnicians',stockMovement:'stockMovements',fuel:'fuel',oil:'oil',stock:'stock',bike:'bikes',maintenance:'maintenance',payroll:'payroll',process:'processes'}))add('operation_changes',entity,(operations as unknown as Record<string,unknown[]>)[field]??[]);
export const businessOriginals=new Map(rows.map(r=>[r.table+':'+r.id,r]));
export const originalBusinessRows=rows;
