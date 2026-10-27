export type SaleLine={product:string;quantity:number|null;unitPrice:number|null};
export function saleLinesTotal(lines:SaleLine[]):number|null {
 if(lines.some(line=>line.quantity===null||line.unitPrice===null))return null;
 return lines.reduce((sum,line)=>sum+Math.round(line.quantity!*line.unitPrice!),0);
}
export function saleLinesSummary(lines:SaleLine[]):string {
 const full=lines.length===1?lines[0].product:lines.map(line=>`${line.quantity??''} ${line.product}`.trim()).join(', ');
 return full.length>1000?full.slice(0,975)+'… (ver produtos da venda)':full;
}

// Only these four recovered Vita sales may keep Tratamento Semanal unpriced.
// Other products and ordinary sales still require their complete prices.
const partialVitaPeriods:Record<string,string>={
 'sale-v-abr-vita-15':'2026-04','sale-v-abr-vita-19':'2026-04',
 'sale-v-maio-vita-19':'2026-05','sale-v-julho-vita-29':'2026-07',
};
type SalePricingScope={id:string;channel:string;period:string};
export function allowsUnpricedVitaTreatment(sale:SalePricingScope,product:string){
 return sale.channel==='Vita'&&partialVitaPeriods[sale.id]===sale.period&&product.trim()==='Tratamento Semanal';
}
export function hasUnpricedVitaTreatment(sale:SalePricingScope,lines:SaleLine[]){
 return lines.some(line=>line.unitPrice===null&&allowsUnpricedVitaTreatment(sale,line.product));
}
export function saleLinesTotalFor(sale:SalePricingScope,lines:SaleLine[]):number|null{
 const full=saleLinesTotal(lines);
 if(full!==null)return full;
 if(!lines.some(line=>line.unitPrice!==null)||lines.some(line=>line.quantity===null||(line.unitPrice===null&&!allowsUnpricedVitaTreatment(sale,line.product))))return null;
 return lines.reduce((sum,line)=>sum+Math.round(line.quantity!*(line.unitPrice??0)),0);
}
