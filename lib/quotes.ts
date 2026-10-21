export type QuoteStatus='draft'|'sent'|'approved'|'rejected';
export type QuoteLine={id:string;description:string;quantity:number;unitCents:number;productId:string;imageKey?:string};
export type Quote={id:string;version:number;clientId:string;clientName:string;clientAddress:string;recipientType?:'client'|'lead';leadPhone?:string;leadEmail?:string;objectDescription?:string;title:string;issuedAt:string;validUntil:string;status:QuoteStatus;items:QuoteLine[];notes:string;terms:string;taskId:string;approvedAt:string;reservationActive?:boolean};
export function quoteTotal(items:QuoteLine[]){return items.reduce((sum,item)=>sum+Math.round(item.quantity*item.unitCents),0)}
export function reservedProducts(quotes:Quote[]){const reserved=new Map<string,number>();for(const quote of quotes)if(quote.status==='approved'&&quote.reservationActive!==false)for(const item of quote.items)if(item.productId)reserved.set(item.productId,(reserved.get(item.productId)??0)+item.quantity);return reserved}
