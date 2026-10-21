type AgendaItem={id:string;deliveryDate?:string;date?:string;deliveryStatus:string};
export function unscheduledAgendaItems<T extends AgendaItem>(items:T[],excludedSaleIds:readonly string[]){
 const excluded=new Set(excludedSaleIds);
 return items.filter(item=>item.deliveryStatus==='pending'&&!(item.deliveryDate||item.date)&&!excluded.has(item.id));
}
