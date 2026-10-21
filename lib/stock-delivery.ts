export type DeliveryAllocation={productId:string;quantity:number};
export type StockForDelivery={id:string;product:string;initial:number;incoming:number;outgoing:number};
export type MovementForDelivery={productId:string;quantity:number};
export type SaleForDelivery={id:string;deliveryStatus:string;stockItems?:DeliveryAllocation[]};
export type StockAvailability={id:string;product:string;available:number;delivered:number};

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();

export function suggestedDeliveryItems(product:string,quantity:number|null,stock:StockAvailability[]):DeliveryAllocation[]{
 const parts=product.split(/\s+e\s+(?=\d+\s)|,\s*(?=\d+\s)/i);
 return parts.map(part=>{const match=/^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(part.trim()),name=(match?match[2]:part).trim(),amount=match?Number(match[1].replace(',','.')):parts.length===1?(quantity??1):1;
  const matches=stock.filter(item=>normalize(item.product)===normalize(name));
  return {productId:matches.length===1?matches[0].id:'',quantity:amount};
 });
}

export function stockAvailability(stock:StockForDelivery[],movements:MovementForDelivery[],sales:SaleForDelivery[]):StockAvailability[]{
 const manual=new Map<string,number>(),delivered=new Map<string,number>();
 for(const movement of movements)manual.set(movement.productId,(manual.get(movement.productId)??0)+movement.quantity);
 for(const sale of sales){if(sale.deliveryStatus!=='delivered')continue;for(const item of sale.stockItems??[])delivered.set(item.productId,(delivered.get(item.productId)??0)+item.quantity)}
 return stock.map(item=>({id:item.id,product:item.product,available:item.initial+item.incoming-item.outgoing-(manual.get(item.id)??0)-(delivered.get(item.id)??0),delivered:delivered.get(item.id)??0}));
}
