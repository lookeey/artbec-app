export type ExpenseStaff={id:string;name:string;active:boolean};
type Expense={id:string;date:string;technician:string;amount:number|null;entryType?:'reading'|'oil'};
const nameKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');

// Expense viewers need only names and employment status, never staff documents.
export function expenseStaffFor(staff:unknown[]):ExpenseStaff[]{
 return staff.flatMap(value=>{
  if(!value||typeof value!=='object')return [];
  const item=value as Record<string,unknown>;
  return item.role==='Técnico'&&typeof item.id==='string'&&typeof item.name==='string'&&item.name.trim()?[{id:item.id,name:item.name.trim(),active:!item.endDate}]:[];
 });
}

function realizedDate(date:string,today:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)||date>today)return false;
 const value=new Date(date+'T12:00:00Z');
 return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date;
}

export function technicianExpenses(fuel:Expense[],oil:Expense[],staff:ExpenseStaff[],period:string,today:string,includeFormer=false){
 function owner(name:string){
  const key=nameKey(name);if(!key)return null;
  // Full names are authoritative. Legacy short names must identify exactly one
  // person, including former employees, to avoid assigning somebody else's cost.
  const exact=staff.filter(item=>nameKey(item.name)===key),matches=exact.length?exact:staff.filter(item=>nameKey(item.name).startsWith(key+' '));
  if(matches.length===1)return matches[0].active||includeFormer?matches[0].name:null;
  return includeFormer?name.trim():null;
 }
 const eligible=(items:Expense[])=>items.flatMap(item=>{
  if(item.entryType==='reading'||!realizedDate(item.date,today))return [];
  const name=owner(item.technician);return name?[{...item,technician:name}]:[];
 });
 const activeFuel=eligible(fuel),activeOil=eligible(oil),monthFuel=activeFuel.filter(item=>item.date.startsWith(period)),monthOil=activeOil.filter(item=>item.date.startsWith(period));
 const sum=(items:Expense[])=>items.reduce((total,item)=>total+(item.amount??0),0);
 const grouped=new Map<string,{name:string;gasoline:number;lubricant:number;total:number;count:number}>();
 for(const [items,field] of [[monthFuel,'gasoline'],[monthOil,'lubricant']] as const)for(const item of items){
  const row=grouped.get(item.technician)??{name:item.technician,gasoline:0,lubricant:0,total:0,count:0};
  row[field]+=item.amount??0;row.total+=item.amount??0;row.count++;grouped.set(row.name,row);
 }
 const rows=[...grouped.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
 const year=period.slice(0,4),months=Array.from({length:12},(_,index)=>`${year}-${String(index+1).padStart(2,'0')}`);
 return {monthFuel,monthOil,fuelTotal:sum(monthFuel),oilTotal:sum(monthOil),total:sum(monthFuel)+sum(monthOil),rows,monthTotals:months.map(value=>({period:value,fuel:sum(activeFuel.filter(item=>item.date.startsWith(value))),oil:sum(activeOil.filter(item=>item.date.startsWith(value)))}))};
}
