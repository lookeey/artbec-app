import type {BillingEntry} from './profitability-billing';

export type CostField='payrollCost'|'fuelCost'|'oilCost'|'maintenanceCost'|'otherCost';
export type CostTechnician={technicianId:string;name:string;aliases:string[];payrollCost:number;fuelCost:number;oilCost:number;maintenanceCost:number};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function billingCostField(category:string):CostField{const value=normalize(category);if(/salario|folha|ferias|fgts|decimo terceiro|13 salario/.test(value))return 'payrollCost';if(/gasolina|combustivel|abastecimento/.test(value))return 'fuelCost';if(/manutenc|oficina|pecas|reparo|revisao/.test(value))return 'maintenanceCost';if(/oleo|lubrificante/.test(value))return 'oilCost';return 'otherCost'}

export function allocateBillingCosts(entries:BillingEntry[],technicians:CostTechnician[],clientTechnicians:Map<string,string[]>){
 const result=new Map(technicians.map(person=>[person.technicianId,{payrollCost:0,fuelCost:0,oilCost:0,maintenanceCost:0,otherCost:0,billingCost:0}]));
 const items=new Map(technicians.map(person=>[person.technicianId,[] as {category:string;description:string;amount:number}[]]));
 const covered=new Map<CostField,Set<string>>();
 for(const entry of entries){
  const discount=entry.direction==='income'?Math.max(0,(entry.grossAmount??entry.amount)-entry.amount):0;
  const amount=entry.direction==='expense'?entry.amount:discount;if(!amount)continue;
  const field:CostField=entry.direction==='income'?'otherCost':billingCostField(entry.category);
  const explicit=entry.technicianIds.filter(id=>result.has(id));
  const byClient=entry.clients.flatMap(name=>clientTechnicians.get(normalize(name))??[]).filter(id=>result.has(id));
  const description=normalize(entry.description);
  const byName=technicians.filter(person=>person.aliases.some(alias=>{const name=normalize(alias);return name.length>=4&&description.includes(name)})).map(person=>person.technicianId);
  const transport=/\b(uber|conducao|passagem|transporte)\b/.test(normalize(entry.category+' '+entry.description));
  const leandro=transport?technicians.filter(person=>normalize(person.name).startsWith('leandro')).map(person=>person.technicianId):[];
  const actualOilUsers=field==='oilCost'?technicians.filter(person=>person.oilCost>0).map(person=>person.technicianId):[];
  const eligible=(ids:string[])=>field==='oilCost'?ids.filter(id=>!normalize(technicians.find(person=>person.technicianId===id)?.name??'').startsWith('leandro')):ids;
  const chosen=eligible(explicit.length?explicit:byClient.length?byClient:byName.length===1?byName:leandro.length===1?leandro:actualOilUsers.length?actualOilUsers:technicians.map(person=>person.technicianId));
  const targets=[...new Set(chosen.length?chosen:eligible(technicians.map(person=>person.technicianId)))];
  if(!targets.length)continue;
  if(field!=='otherCost'){const ids=covered.get(field)??new Set<string>();targets.forEach(id=>ids.add(id));covered.set(field,ids)}
  const weighted=field!=='otherCost'&&targets.reduce((sum,id)=>sum+(technicians.find(person=>person.technicianId===id)?.[field]??0),0)>0;
  const weights=targets.map(id=>weighted?technicians.find(person=>person.technicianId===id)?.[field]??0:1),weightTotal=weights.reduce((sum,value)=>sum+value,0);
  let allocated=0;targets.forEach((id,index)=>{const share=index===targets.length-1?amount-allocated:Math.floor(amount*weights[index]/weightTotal);allocated+=share;const row=result.get(id)!;row[field]+=share;row.billingCost+=share;items.get(id)!.push({category:entry.direction==='income'?'Descontos':entry.category,description:entry.description,amount:share})});
 }
 return {costs:result,covered,items};
}
