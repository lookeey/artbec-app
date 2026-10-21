import source from '@/data/management.json';
import {database} from '@/lib/finance-store';

export type ManagementEntity='client'|'staff'|'fine';
export const originalManagement={
 client:new Map(source.customers.map(item=>[item.id,item])),
 staff:new Map(source.staff.map(item=>[item.id,item])),
 fine:new Map(source.fines.map(item=>[item.id,item])),
};

export async function getManagement(){
 const clients=new Map(originalManagement.client),staff=new Map(originalManagement.staff),fines=new Map(originalManagement.fine);
 const legacy=await database().prepare('SELECT id,data FROM fine_changes').all<{id:string;data:string}>();
 for(const row of legacy.results){const current=fines.get(row.id);if(current){const saved=JSON.parse(row.data);fines.set(row.id,{...current,status:saved.status??current.status,version:0})}}
 const saved=await database().prepare('SELECT id,entity,data,version,deleted FROM management_changes').all<{id:string;entity:ManagementEntity;data:string;version:number;deleted:number}>();
 const maps={client:clients,staff,fine:fines};
 for(const row of saved.results){const map=maps[row.entity];if(!map)continue;if(row.deleted)map.delete(row.id);else map.set(row.id,{...JSON.parse(row.data),version:row.version})}
 return {...source,customers:[...clients.values()],staff:[...staff.values()],fines:[...fines.values()].map(item=>({installments:1,deductFromPayroll:false,payrollStartPeriod:'',...item}))};
}
