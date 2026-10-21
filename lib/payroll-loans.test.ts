import test from 'node:test';
import assert from 'node:assert/strict';
import {loanDeductions,payrollLoanSchema,monthlyLoanInstallments,type PayrollLoan} from './payroll-loans.ts';
import {payrollRollover} from './payroll-rollover.ts';
const loan:PayrollLoan={id:`payrollLoan-${crypto.randomUUID()}`,version:1,employee:'Esdras',issuedDate:'2026-10-06',amount:80000,notes:'',status:'active',installments:[{id:crypto.randomUUID(),period:'2026-11',payment:'thirteenthFirst',amount:40000,status:'planned'},{id:crypto.randomUUID(),period:'2026-12',payment:'thirteenthSecond',amount:40000,status:'planned'}]};
test('800 reais em duas parcelas do 13º não descontam salário nem se repetem em janeiro',()=>{
 assert.equal(payrollLoanSchema.safeParse(loan).success,true);
 assert.deepEqual(loanDeductions([loan],' ESDRAS ','2026-11'),{salary:0,advance15:0,thirteenthFirst:40000,thirteenthSecond:0});
 assert.equal(loanDeductions([loan],'Esdras','2026-12').thirteenthSecond,40000);
 assert.equal(Object.values(loanDeductions([loan],'Esdras','2027-01')).reduce((a,b)=>a+b,0),0);
 assert.equal(Object.values(loanDeductions([loan],'Outro','2026-11')).reduce((a,b)=>a+b,0),0);
});
test('confirmar execução não duplica desconto; cancelar retira a previsão',()=>{
 const confirmed={...loan,installments:loan.installments.map(i=>({...i,status:'deducted' as const}))};
 assert.deepEqual(loanDeductions([confirmed],'Esdras','2026-11'),loanDeductions([loan],'Esdras','2026-11'));
 assert.equal(loanDeductions([{...loan,status:'cancelled'}],'Esdras','2026-11').thirteenthFirst,0);
});
test('rejeita soma incorreta, parcelas repetidas e desconto anterior ao empréstimo',()=>{
 assert.equal(payrollLoanSchema.safeParse({...loan,amount:90000}).success,false);
 assert.equal(payrollLoanSchema.safeParse({...loan,installments:[loan.installments[0],loan.installments[0]]}).success,false);
 assert.equal(payrollLoanSchema.safeParse({...loan,issuedDate:'2026-12-01'}).success,false);
});
test('virada de mês preserva valores mensais mas não repete o pagamento do 13º',async()=>{
 const months=await payrollRollover([{id:'p',version:1,employee:'Esdras',period:'2026-11',baseSalary:200000,thirteenthFirst:100000,thirteenthSecond:0}],[],'2026-12');
 assert.equal(months[0].items[0].baseSalary,200000);assert.equal(months[0].items[0].thirteenthFirst,0);assert.equal(months[0].items[0].thirteenthSecond,0);
});

test('Vasco: cinco parcelas de 200 de outubro até fevereiro, sem repetir depois',()=>{
 const installments=monthlyLoanInstallments(100000,5,'2026-10','salary');
 assert.deepEqual(installments.map(i=>[i.period,i.amount]),[['2026-10',20000],['2026-11',20000],['2026-12',20000],['2027-01',20000],['2027-02',20000]]);
 const agreement={...loan,employee:'Vasco',amount:100000,installments};
 assert.equal(payrollLoanSchema.safeParse(agreement).success,true);assert.equal(loanDeductions([agreement],'Vasco','2026-10').salary,20000);assert.equal(loanDeductions([agreement],'Vasco','2027-03').salary,0);
});
test('parcelamento conserva todos os centavos e rejeita quantidade inválida',()=>{
 const installments=monthlyLoanInstallments(100001,5,'2026-10','advance15');assert.equal(installments.reduce((s,i)=>s+i.amount,0),100001);assert.equal(installments.at(-1)?.amount,20001);
 assert.throws(()=>monthlyLoanInstallments(100000,0,'2026-10','salary'));assert.throws(()=>monthlyLoanInstallments(100000,5,'2026-13','salary'));
});

test('descontos opcionais do 13º ficam apenas na competência editada',async()=>{
 const months=await payrollRollover([{id:'p',version:1,employee:'Teste',period:'2026-11',thirteenthDeductionsEnabled:true,thirteenthFirstDeduction:20000,thirteenthSecondDeduction:10000}],[],'2026-12');
 assert.equal(months[0].items[0].thirteenthDeductionsEnabled,false);assert.equal(months[0].items[0].thirteenthFirstDeduction,0);assert.equal(months[0].items[0].thirteenthSecondDeduction,0);
});
