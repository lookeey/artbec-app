export type CustomerIdentity={id:string;name:string};
export const customerNameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
export function customerRecordMatcher(customer:CustomerIdentity,customers:CustomerIdentity[]){
 const key=customerNameKey(customer.name),unique=customers.filter(c=>customerNameKey(c.name)===key).length===1;
 return (row:{clientId?:string;clientName?:string;client?:string})=>row.clientId?row.clientId===customer.id:unique&&customerNameKey(row.clientName??row.client??'')===key;
}
export type CustomerHistoryRow={id:string;date:string;title:string;detail:string;status:string;amount?:number|null};
export type CustomerHistorySection={key:string;title:string;rows:CustomerHistoryRow[];note?:string};
export type CustomerHistory={clientId:string;sections:CustomerHistorySection[];asOf:string;matchingNote:string};
