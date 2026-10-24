import {businessToday} from './month-rollover.ts';

type Product={id:string;product:string;incoming:number;outgoing:number};
type Movement={id:string;date:string;productId:string;product:string;quantity:number;technician:string};
type Sale={id:string;deliveryStatus:string;deliveredAt?:string;stockItems?:{productId:string;quantity:number}[]};
export type StockAudit={sequence:number;record_id:string;before_data:string|null;after_data:string|null;at:string};
export type StockHistoryEntry={id:string;date:string;direction:'in'|'out';productId:string;product:string;quantity:number;description:string};

const amount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:0;
function dateOnly(value:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value))return '';
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';
}

// Dated manual counter changes come from the existing audit trail. Imported
// cumulative quantities have no movement date and remain explicitly undated.
export function stockHistory(products:Product[],movements:Movement[],sales:Sale[],audit:StockAudit[]):StockHistoryEntry[]{
 const names=new Map(products.map(item=>[item.id,item.product])),net=new Map<string,number>(),entries:StockHistoryEntry[]=[];
 const add=(entry:StockHistoryEntry)=>{if(Number.isFinite(entry.quantity)&&entry.quantity>0)entries.push({...entry,quantity:Math.round(entry.quantity*1e8)/1e8})};
 for(const event of audit){
  if(!event.after_data)continue;
  const before=event.before_data?JSON.parse(event.before_data):{},after=JSON.parse(event.after_data);
  const at=new Date(event.at),day=Number.isFinite(at.getTime())?businessToday(at):'';
  for(const field of ['incoming','outgoing','initial'] as const){
   // An opening balance is not a dated receipt. Later corrections to that
   // balance do affect stock and belong to the date of the correction.
   if(field==='initial'&&typeof before.initial!=='number')continue;
   const delta=amount(after[field])-amount(before[field]);
   net.set(event.record_id+':'+field,(net.get(event.record_id+':'+field)??0)+delta);
   const incoming=(field!=='outgoing')===(delta>0);
   add({id:`audit-${event.sequence}-${field}`,date:day,direction:incoming?'in':'out',productId:event.record_id,product:names.get(event.record_id)??String(after.product??before.product??'Produto removido'),quantity:Math.abs(delta),description:field==='initial'?'Correção do saldo inicial':delta<0?(field==='incoming'?'Correção de entrada':'Correção de saída'):'Ajuste de estoque'});
  }
 }
 for(const item of products)for(const field of ['incoming','outgoing'] as const){
  const remaining=amount(item[field])-(net.get(item.id+':'+field)??0);
  add({id:`undated-${item.id}-${field}`,date:'',direction:field==='incoming'?'in':'out',productId:item.id,product:item.product,quantity:remaining,description:'Quantidade anterior sem data registrada'});
 }
 for(const item of movements)add({id:'withdrawal-'+item.id,date:dateOnly(item.date),direction:'out',productId:item.productId,product:names.get(item.productId)??item.product,quantity:item.quantity,description:'Retirada · '+item.technician});
 for(const sale of sales){
  if(sale.deliveryStatus!=='delivered')continue;
  // Scheduled dates and the one-time historical regularization must not create
  // stock exits. Only actual, linked deliveries consume inventory.
  for(const [index,item] of (sale.stockItems??[]).entries())add({id:`delivery-${sale.id}-${index}`,date:dateOnly(sale.deliveredAt??''),direction:'out',productId:item.productId,product:names.get(item.productId)??'Produto removido',quantity:item.quantity,description:'Entrega de venda'});
 }
 return entries.sort((a,b)=>b.date.localeCompare(a.date)||a.product.localeCompare(b.product,'pt-BR')||a.id.localeCompare(b.id));
}
