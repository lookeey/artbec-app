import type {SaleLine} from './sale-lines.ts';
export type VitaSale={lineItems?:SaleLine[];id:string;date:string;period:string;client:string;product:string;quantity:number|null;total:number|null};
export type VitaHalf='first'|'second';
export type VitaProduct={name:string;quantity:number};
export type VitaClosing={id:string;version:number;period:string;location:string;half:VitaHalf;status:'closed'|'open';closedAt:string;total:number;count:number;products:VitaProduct[];signature:string};

export const vitaClosingId=(period:string,location:string,half:VitaHalf)=>{
 const encoded=Array.from(new TextEncoder().encode(location.normalize('NFC').toLocaleLowerCase('pt-BR'))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return `vitaClosing-${period}-${half}-${encoded}`;
};

export function summarizeVitaHalf(sales:VitaSale[],period:string,location:string,half:VitaHalf){
 const month=sales.filter(item=>item.period===period&&item.client===location);
 const undated=month.filter(item=>!/^\d{4}-\d{2}-\d{2}$/.test(item.date));
 const selected=month.filter(item=>{if(!item.date.startsWith(`${period}-`))return false;const day=Number(item.date.slice(8,10));return half==='first'?day>=1&&day<=15:day>=16&&day<=31});
 const products=new Map<string,VitaProduct>();
 for(const sale of selected){
  if(sale.lineItems?.length){for(const line of sale.lineItems){const name=line.product.trim(),key=name.toLocaleLowerCase('pt-BR'),previous=products.get(key);products.set(key,{name:previous?.name??name,quantity:(previous?.quantity??0)+(line.quantity??1)})}continue}
  const parts=sale.product.split(/\s+e\s+(?=\d+\s)|,\s*(?=\d+\s)/i);
  for(const part of parts){const match=/^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(part.trim());const quantity=match?Number(match[1].replace(',','.')):(sale.quantity??1),name=(match?match[2]:part).trim();if(!name)continue;const key=name.toLocaleLowerCase('pt-BR');const previous=products.get(key);products.set(key,{name:previous?.name??name,quantity:(previous?.quantity??0)+quantity})}
 }
 return {total:selected.reduce((sum,item)=>sum+(item.total??0),0),count:selected.length,products:[...products.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),undated:undated.length,signature:selected.map(item=>[item.id,item.date,item.product,item.quantity,item.total].join('|')+(item.lineItems?.length?'|'+JSON.stringify(item.lineItems):'')).sort().join(';')};
}
