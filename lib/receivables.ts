export type MonthlyReceivable={id:string;kind:string;client:string;period:string;date:string;amount:number|null;payment:string;status:string};
export type ProductReceivable={id:string;channel:string;client:string;product:string;period:string;date:string;deliveryDate:string;deliveredAt?:string;deliveryStatus:string;total:number|null;status:string;payment?:string;billingClient?:string;billingDueDay?:number|null};
export type ReceivableRow={id:string;kind:'monthly'|'product';client:string;description:string;dueDate:string;amount:number;payment:string;paymentGroup:string;projected:boolean};
export type UnresolvedReceivable={id:string;client:string;description:string;amount:number;reason:string};

const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(`${date}T12:00:00Z`))&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date;
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function paymentGroup(value:string){const text=normalize(value);if(!text)return 'unknown';if(text.includes('boleto'))return 'boleto';if(text.includes('pix'))return 'pix';if(/\b(transf|transferencia|ted|doc)\b/.test(text)||text.includes('transfer'))return 'transfer';return 'other'}
function dueDate(year:number,month:number,day:number){const last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`}
function nextMonth(year:number,month:number){return month===12?[year+1,1]:[year,month+1]}
function monthsBetween(from:string,to:string){const result:string[]=[];let year=Number(from.slice(0,4)),month=Number(from.slice(5,7));while(`${year}-${String(month).padStart(2,'0')}`<=to&&result.length<36){result.push(`${year}-${String(month).padStart(2,'0')}`);[year,month]=nextMonth(year,month)}return result}
function matchedMonthly(client:string,monthly:MonthlyReceivable[]){const target=normalize(client);if(!target)return null;const exact=monthly.filter(row=>normalize(row.client)===target);if(exact.length)return exact.sort((a,b)=>b.period.localeCompare(a.period))[0];if(target.length<5)return null;const names=[...new Set(monthly.map(row=>row.client).filter(name=>{const value=normalize(name);return value.length>=5&&(value.includes(target)||target.includes(value))}))];return names.length===1?monthly.filter(row=>row.client===names[0]).sort((a,b)=>b.period.localeCompare(a.period))[0]:null}

export function buildReceivables(monthly:MonthlyReceivable[],sales:ProductReceivable[],from:string,to:string){
 const rows:ReceivableRow[]=[],unresolved:UnresolvedReceivable[]=[];
 if(!validDate(from)||!validDate(to)||from>to)return {rows,unresolved};
 const bills=monthly.filter(row=>row.kind==='Mensalidade');
 const actual=new Set(bills.map(row=>`${normalize(row.client)}|${row.period}`));
 for(const row of bills){if(row.status==='paid')continue;if(row.amount===null||!validDate(row.date)){if(row.period>=from.slice(0,7)&&row.period<=to.slice(0,7))unresolved.push({id:row.id,client:row.client,description:'Mensalidade',amount:row.amount??0,reason:row.amount===null?'Valor não informado':'Vencimento não informado'});continue}if(row.date>=from&&row.date<=to)rows.push({id:row.id,kind:'monthly',client:row.client,description:'Mensalidade',dueDate:row.date,amount:row.amount,payment:row.payment,paymentGroup:paymentGroup(row.payment),projected:false})}
 const counts=new Map<string,number>();for(const row of bills)if(/^\d{4}-\d{2}$/.test(row.period))counts.set(row.period,(counts.get(row.period)??0)+1);
 const maxCount=Math.max(0,...counts.values()),latestPeriod=[...counts].filter(([,count])=>count>=maxCount*.75).map(([period])=>period).sort().at(-1)??'';
 const cohortMap=new Map<string,MonthlyReceivable>();for(const row of bills.filter(row=>row.period>=latestPeriod).sort((a,b)=>a.period.localeCompare(b.period)))cohortMap.set(normalize(row.client),row);
 for(const period of monthsBetween(from.slice(0,7),to.slice(0,7))){if(period<=latestPeriod)continue;for(const row of cohortMap.values()){if(row.period>=period||actual.has(`${normalize(row.client)}|${period}`)||row.amount===null||!validDate(row.date))continue;const date=dueDate(Number(period.slice(0,4)),Number(period.slice(5,7)),Number(row.date.slice(8)));if(date<from||date>to)continue;rows.push({id:`projected-${row.id}-${period}`,kind:'monthly',client:row.client,description:'Mensalidade prevista',dueDate:date,amount:row.amount,payment:row.payment,paymentGroup:paymentGroup(row.payment),projected:true})}}
 for(const sale of sales){if(sale.channel!=='Clientes'||sale.status==='paid')continue;
  const amount=sale.total??0,delivered=sale.deliveryStatus==='delivered',delivery=delivered?(sale.deliveredAt||sale.deliveryDate||sale.date):(sale.deliveryDate||sale.date);
  const match=matchedMonthly(sale.billingClient?.trim()||sale.client,bills),day=sale.billingDueDay??(match&&validDate(match.date)?Number(match.date.slice(8)):null),payment=sale.payment?.trim()||match?.payment||'';
  const reason=sale.total===null?'Valor não informado':!validDate(delivery)?'Data de entrega não informada':!day?'Vencimento da mensalidade não identificado':'';
  if(reason){const month=validDate(delivery)?delivery.slice(0,7):sale.period;if(month>=from.slice(0,7)&&month<=to.slice(0,7))unresolved.push({id:sale.id,client:sale.client,description:sale.product,amount,reason});continue}
  let year=Number(delivery.slice(0,4)),month=Number(delivery.slice(5,7)),due=dueDate(year,month,day!);if(delivery>due){[year,month]=nextMonth(year,month);due=dueDate(year,month,day!)}
  if(due>=from&&due<=to)rows.push({id:sale.id,kind:'product',client:sale.client,description:sale.product,dueDate:due,amount,payment,paymentGroup:paymentGroup(payment),projected:!delivered});
 }
 rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.client.localeCompare(b.client,'pt-BR')||a.id.localeCompare(b.id));
 return {rows,unresolved};
}
