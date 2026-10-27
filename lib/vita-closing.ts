import type {SaleLine} from './sale-lines.ts';
export type VitaSale={lineItems?:SaleLine[];id:string;date:string;deliveryDate?:string;period:string;client:string;product:string;quantity:number|null;total:number|null};
export type VitaHalf='first'|'second';
export type VitaProduct={name:string;quantity:number};
export type VitaClosing={id:string;version:number;period:string;location:string;half:VitaHalf;status:'closed'|'open';closedAt:string;total:number;count:number;products:VitaProduct[];signature:string};

export const vitaClosingId=(period:string,location:string,half:VitaHalf)=>{
 const encoded=Array.from(new TextEncoder().encode(location.normalize('NFC').toLocaleLowerCase('pt-BR'))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return `vitaClosing-${period}-${half}-${encoded}`;
};

// Delivery defines the closing month and fortnight; an undated sale stays visible
// in its registered month so it can be corrected before closing.
export function vitaDeliveryDate(sale:Pick<VitaSale,'deliveryDate'>){
 const value=sale.deliveryDate??'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';
}
export function vitaSalesForMonth<T extends VitaSale>(sales:T[],period:string,location:string){
 return sales.filter(item=>item.client===location&&(vitaDeliveryDate(item)?vitaDeliveryDate(item).slice(0,7)===period:item.period===period));
}
export function summarizeVitaHalf(sales:VitaSale[],period:string,location:string,half:VitaHalf){
 const month=vitaSalesForMonth(sales,period,location);
 const undated=month.filter(item=>!vitaDeliveryDate(item));
 const selected=month.filter(item=>{const delivery=vitaDeliveryDate(item);if(!delivery)return false;const day=Number(delivery.slice(8,10));return half==='first'?day<=15:day>=16});
 return {...summarizeVitaSales(selected),undated:undated.length};
}
export function summarizeVitaMonth(sales:VitaSale[],period:string,location:string){
 return summarizeVitaSales(vitaSalesForMonth(sales,period,location).filter(item=>vitaDeliveryDate(item)));
}
function summarizeVitaSales(selected:VitaSale[]){
 const products=new Map<string,VitaProduct>();
 for(const sale of selected){
  if(sale.lineItems?.length){for(const line of sale.lineItems){const name=line.product.trim(),key=name.toLocaleLowerCase('pt-BR'),previous=products.get(key);products.set(key,{name:previous?.name??name,quantity:(previous?.quantity??0)+(line.quantity??1)})}continue}
  const parts=sale.product.split(/\s+e\s+(?=\d+\s)|,\s*(?=\d+\s)/i);
  for(const part of parts){const match=/^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(part.trim());const quantity=match?Number(match[1].replace(',','.')):(sale.quantity??1),name=(match?match[2]:part).trim();if(!name)continue;const key=name.toLocaleLowerCase('pt-BR');const previous=products.get(key);products.set(key,{name:previous?.name??name,quantity:(previous?.quantity??0)+quantity})}
 }
 return {total:selected.reduce((sum,item)=>sum+(item.total??0),0),count:selected.length,products:[...products.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),signature:'delivery-date-v1:'+selected.map(item=>[item.id,vitaDeliveryDate(item),item.product,item.quantity,item.total].join('|')+(item.lineItems?.length?'|'+JSON.stringify(item.lineItems):'')).sort().join(';')};
}
