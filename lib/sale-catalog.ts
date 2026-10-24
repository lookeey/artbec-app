export type SaleCatalog={products:string[];customers:string[];prices:{product:string;price:number}[]};
type CatalogSource={stock:unknown[];prices:unknown[]};
const productKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');

// Sales may read retail prices, but purchase costs and suppliers stay private.
export function saleCatalogFor(source:CatalogSource,customers:string[]=[]):SaleCatalog{
 const prices=source.prices.filter((item):item is {product:string;price:number}=>typeof item==='object'&&item!==null&&'kind' in item&&item.kind==='Revenda'&&'product' in item&&typeof item.product==='string'&&'price' in item&&typeof item.price==='number'&&Number.isFinite(item.price)&&item.price>=0).map(({product,price})=>({product,price}));
 const stock=source.stock.flatMap(item=>typeof item==='object'&&item!==null&&'product' in item&&typeof item.product==='string'?[item.product]:[]);
 // Product choices follow inventory names; price-only aliases are not products.
 return {products:[...new Set(stock)],customers,prices};
}

export function saleProductPrice(product:string,prices:SaleCatalog['prices']):number|null{
 const matches=prices.filter(item=>productKey(item.product)===productKey(product));
 if(!matches.length||matches.some(item=>item.price!==matches[0].price))return null;
 return matches[0].price;
}
