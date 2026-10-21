export function previousComparisonMonth(period:string){const d=new Date(period+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
export function comparisonRange(period:string,matched:boolean,today:string){
 const [y,m]=period.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate(),day=matched?Math.min(last,Number(today.slice(8,10))):last;
 return {start:period+'-01',end:period+'-'+String(day).padStart(2,'0')};
}
export type ComparisonRow={id:string;date:string;title:string;detail:string;amount:number;status:string};
export type ComparisonMetric={key:string;title:string;unit:'money'|'count';view:string;current:number;previous:number;delta:number;percent:number|null;currentRows:ComparisonRow[];previousRows:ComparisonRow[]};
export function comparisonMetric(key:string,title:string,unit:ComparisonMetric['unit'],view:string,currentRows:ComparisonRow[],previousRows:ComparisonRow[]):ComparisonMetric{
 const total=(rows:ComparisonRow[])=>rows.reduce((s,r)=>s+r.amount,0),current=total(currentRows),previous=total(previousRows);
 return {key,title,unit,view,current,previous,delta:current-previous,percent:previous===0?(current===0?0:null):(current-previous)/Math.abs(previous)*100,currentRows,previousRows};
}
export type ExecutiveComparison={period:string;previousPeriod:string;matched:boolean;today:string;currentRange:{start:string;end:string};previousRange:{start:string;end:string};metrics:ComparisonMetric[];missingDates:number;note:string};
