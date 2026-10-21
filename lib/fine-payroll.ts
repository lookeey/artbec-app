export type FineForPayroll={
 id:string;technician:string;description:string;amount:number|null;status:string;
 installments?:number;deductFromPayroll?:boolean;payrollStartPeriod?:string;
};
export type PayrollPerson={employee:string;period:string};
export type FineDeduction={fineId:string;employee:string;period:string;description:string;amount:number;installment:number;installments:number};

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
export const shiftPeriod=(period:string,months:number)=>{const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);if(!match)return '';const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1+months,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`};
export function fineInstallmentAmount(amount:number,installments:number,index:number){const count=Math.max(1,Math.floor(installments));return Math.floor(amount/count)+(index<amount%count?1:0)}
export function calculateFineDeductions(fines:FineForPayroll[],payroll:PayrollPerson[]):FineDeduction[]{
 const result:FineDeduction[]=[];
 for(const fine of fines){
  if(!fine.deductFromPayroll||fine.status==='appeal'||!fine.amount||!/^\d{4}-(0[1-9]|1[0-2])$/.test(fine.payrollStartPeriod??''))continue;
  const count=Math.max(1,Math.min(36,Math.floor(fine.installments??1))),name=normalize(fine.technician);
  for(let index=0;index<count;index++){
   const period=shiftPeriod(fine.payrollStartPeriod!,index),candidates=payroll.filter(person=>person.period===period);
   const exact=candidates.filter(person=>normalize(person.employee)===name);
   const first=candidates.filter(person=>normalize(person.employee).split(' ')[0]===name.split(' ')[0]);
   const match=exact.length===1?exact[0]:exact.length===0&&first.length===1?first[0]:null;
   if(match)result.push({fineId:fine.id,employee:match.employee,period,description:fine.description,amount:fineInstallmentAmount(fine.amount,count,index),installment:index+1,installments:count});
  }
 }
 return result;
}
