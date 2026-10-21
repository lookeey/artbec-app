import {nextPeriod} from './month-rollover.ts';

type PayrollRecord={id:string;period:string;employee:string;version:number};
const employeeKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');

// Completed months also preserve an intentionally empty/deleted monthly roster.
export async function payrollRollover<T extends PayrollRecord>(items:T[],completed:string[],target:string){
 const valid=(period:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(period);
 const periods=[...new Set([...items.map(item=>item.period),...completed])].filter(valid).sort();
 let previous=periods.filter(period=>period<target).at(-1);
 const months:{period:string;items:T[]}[]=[],working=[...items];
 for(let count=0;previous&&previous<target&&count<240;count++){
  const period=nextPeriod(previous);
  if(!completed.includes(period)){
   const existing=new Set(working.filter(item=>item.period===period).map(item=>employeeKey(item.employee)));
   const copies:T[]=[];
   for(const template of working.filter(item=>item.period===previous)){
    const key=employeeKey(template.employee);
    if(existing.has(key))continue;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${period}|${key}`));
    const suffix=[...new Uint8Array(digest)].slice(0,16).map(byte=>byte.toString(16).padStart(2,'0')).join('');
    copies.push({...template,...('thirteenthFirst' in template||'thirteenthSecond' in template||'thirteenthDeductionsEnabled' in template||'thirteenthFirstDeduction' in template||'thirteenthSecondDeduction' in template?{thirteenthFirst:0,thirteenthSecond:0,...('thirteenthDeductionsEnabled' in template||'thirteenthFirstDeduction' in template||'thirteenthSecondDeduction' in template?{thirteenthDeductionsEnabled:false,thirteenthFirstDeduction:0,thirteenthSecondDeduction:0}:{})}:{}),id:`payroll-recurring-${period}-${suffix}`,period,version:1});
    existing.add(key);
   }
   months.push({period,items:copies});
   working.push(...copies);
  }
  previous=period;
 }
 return months;
}
