export type SaleLine={product:string;quantity:number|null;unitPrice:number|null};
export function saleLinesTotal(lines:SaleLine[]):number|null {
 if(lines.some(line=>line.quantity===null||line.unitPrice===null))return null;
 return lines.reduce((sum,line)=>sum+Math.round(line.quantity!*line.unitPrice!),0);
}
export function saleLinesSummary(lines:SaleLine[]):string {
 const full=lines.length===1?lines[0].product:lines.map(line=>`${line.quantity??''} ${line.product}`.trim()).join(', ');
 return full.length>1000?full.slice(0,975)+'… (ver produtos da venda)':full;
}
