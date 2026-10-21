import {z} from 'zod';
import {nextPeriod} from './month-rollover.ts';
export const loanPayments={salary:'Salário / fechamento',advance15:'Adiantamento dia 15',thirteenthFirst:'1ª parcela do 13º',thirteenthSecond:'2ª parcela do 13º'} as const;
const amount=z.number().int().positive().max(99999999900);
export const payrollLoanSchema=z.object({id:z.string().regex(/^payrollLoan-[0-9a-f-]{36}$/i),version:z.number().int().min(0),employee:z.string().trim().min(1).max(200),issuedDate:z.string().date(),amount,notes:z.string().max(1000),status:z.enum(['active','cancelled']),installments:z.array(z.object({id:z.string().uuid(),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),payment:z.enum(['salary','advance15','thirteenthFirst','thirteenthSecond']),amount,status:z.enum(['planned','deducted'])})).min(1).max(36)}).superRefine((loan,ctx)=>{
 if(loan.installments.reduce((sum,i)=>sum+i.amount,0)!==loan.amount)ctx.addIssue({code:'custom',message:'A soma das parcelas precisa ser igual ao valor emprestado.'});
 if(new Set(loan.installments.map(i=>i.id)).size!==loan.installments.length)ctx.addIssue({code:'custom',message:'Parcelas duplicadas.'});
 if(loan.installments.some(i=>i.period<loan.issuedDate.slice(0,7)))ctx.addIssue({code:'custom',message:'O desconto não pode ser anterior ao mês do empréstimo.'});
});
export type PayrollLoan=z.infer<typeof payrollLoanSchema>;
const key=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function loanDeductions(loans:PayrollLoan[],employee:string,period:string){
 const result={salary:0,advance15:0,thirteenthFirst:0,thirteenthSecond:0};
 for(const loan of loans){if(loan.status!=='active'||key(loan.employee)!==key(employee))continue;for(const installment of loan.installments){if(installment.period===period)result[installment.payment]+=installment.amount}}
 return result;
}

export function monthlyLoanInstallments(total:number,count:number,firstPeriod:string,payment:PayrollLoan['installments'][number]['payment']):PayrollLoan['installments']{
 if(!Number.isSafeInteger(total)||total<1||!Number.isInteger(count)||count<1||count>36||total<count||!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstPeriod))throw Error('Confira o valor, o número de parcelas e o primeiro mês.');
 const part=Math.floor(total/count),remainder=total-part*count,rows:PayrollLoan['installments']=[];let period=firstPeriod;
 for(let i=0;i<count;i++){rows.push({id:crypto.randomUUID(),period,payment,amount:part+(i===count-1?remainder:0),status:'planned'});period=nextPeriod(period)}
 return rows;
}
