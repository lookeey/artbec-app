import type {StockAvailability} from './stock-delivery';

type Product={id:string;product:string;minimum:number};
type Movement={productId:string;quantity:number;date:string};
type Sale={deliveryStatus:string;deliveredAt?:string;deliveryDate?:string;stockItems?:{productId:string;quantity:number}[]};
export type PurchaseSuggestion={id:string;product:string;available:number;minimum:number;consumed60:number;monthlyAverage:number;daysOfCover:number|null;suggested:number;urgent:boolean};

export function purchaseSuggestions(products:Product[],availability:StockAvailability[],movements:Movement[],sales:Sale[],today:string):PurchaseSuggestion[]{
 const cutoff=new Date(`${today}T12:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-59);const start=cutoff.toISOString().slice(0,10);
 const usage=new Map<string,number>();const add=(id:string,quantity:number)=>{if(id&&Number.isFinite(quantity)&&quantity>0)usage.set(id,(usage.get(id)??0)+quantity)};
 for(const movement of movements)if(movement.date.slice(0,10)>=start&&movement.date.slice(0,10)<=today)add(movement.productId,movement.quantity);
 for(const sale of sales)if(sale.deliveryStatus==='delivered'){const delivered=(sale.deliveredAt||sale.deliveryDate||'').slice(0,10);if(delivered>=start&&delivered<=today)for(const item of sale.stockItems??[])add(item.productId,item.quantity)}
 const balances=new Map(availability.map(item=>[item.id,item.available]));
 return products.map(item=>{const available=balances.get(item.id)??0,consumed60=usage.get(item.id)??0,monthlyAverage=Math.ceil(consumed60/2),target=Math.max(0,item.minimum)+monthlyAverage,suggested=Math.max(0,Math.ceil(target-available)),daysOfCover=consumed60>0?Math.max(0,Math.floor(available/(consumed60/60))):null;return {id:item.id,product:item.product,available,minimum:item.minimum,consumed60,monthlyAverage,daysOfCover,suggested,urgent:available<=item.minimum||daysOfCover!==null&&daysOfCover<15}}).filter(item=>item.suggested>0).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||(a.daysOfCover??Infinity)-(b.daysOfCover??Infinity)||a.product.localeCompare(b.product,'pt-BR'));
}
