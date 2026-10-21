import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCashForecast} from './cash-forecast.ts';
import type {PayrollLoan} from './payroll-loans.ts';

test('empréstimos ajustam o pagamento escolhido sem duplicar desconto no fechamento',()=>{
 const person={id:'p1',period:'2026-11',employee:'Esdras',baseSalary:200000,hazardPay:0,overtime:0,bonus:0,inss:0,absences:0,advance:0,advance15:50000,loan:0,fines:0,thirteenthFirst:100000};
 const loan:PayrollLoan={id:`payrollLoan-${crypto.randomUUID()}`,version:1,employee:'Esdras',issuedDate:'2026-10-06',amount:80000,notes:'',status:'active',installments:[{id:crypto.randomUUID(),period:'2026-11',payment:'advance15',amount:20000,status:'planned'},{id:crypto.randomUUID(),period:'2026-11',payment:'salary',amount:20000,status:'planned'},{id:crypto.randomUUID(),period:'2026-11',payment:'thirteenthFirst',amount:40000,status:'planned'}]};
 const report=buildCashForecast({monthly:[],sales:[],academyInvoices:[],fuel:[],oil:[],maintenance:[],fines:[],payroll:[person],payrollLoans:[loan]},'2026-11-01','2026-11-30');
 assert.equal(report.rows.find(r=>r.id==='payroll-15-p1')?.amount,30000);
 assert.equal(report.rows.find(r=>r.id==='payroll-30-p1')?.amount,130000);
 assert.equal(report.rows.find(r=>r.id==='payroll-thirteenthFirst-p1')?.amount,60000);
 assert.equal(report.totals.outExpected,220000);
});

test('separa entradas pagas, previstas e despesas por data',()=>{
 const report=buildCashForecast({monthly:[{id:'m1',kind:'Mensalidade',client:'Ana',period:'2026-10',date:'2026-10-10',amount:30000,payment:'PIX',status:'paid'},{id:'m2',kind:'Mensalidade',client:'Bia',period:'2026-10',date:'2026-10-20',amount:40000,payment:'BOLETO',status:'pending'}],sales:[],academyInvoices:[{id:'a1',label:'Academia',dueDate:'2026-10-25',amount:10000,status:'pending'}],fuel:[{id:'f1',date:'2026-10-05',amount:5000,technician:'João'}],oil:[],maintenance:[],payroll:[],fines:[]},'2026-10-01','2026-10-30');
 assert.deepEqual(report.totals,{inConfirmed:30000,inExpected:50000,outConfirmed:5000,outExpected:0,balance:75000});
 assert.equal(report.rows.length,4);
});

test('folha mostra dia 15 e saldo do dia 30 sem duplicar adiantamento',()=>{
 const report=buildCashForecast({monthly:[],sales:[],academyInvoices:[],fuel:[],oil:[],maintenance:[],payroll:[{id:'p1',period:'2026-10',employee:'Ana',baseSalary:200000,hazardPay:0,overtime:0,bonus:0,inss:10000,absences:0,advance:0,advance15:50000,loan:0,fines:0}],fines:[]},'2026-10-01','2026-10-30');
 assert.equal(report.totals.outExpected,190000);
 assert.deepEqual(report.rows.map(row=>[row.date,row.amount]),[['2026-10-15',50000],['2026-10-30',140000]]);
});

test('13º só aplica desconto manual quando a opção está marcada',()=>{
 const payroll={id:'p1',period:'2026-11',employee:'Teste',baseSalary:0,hazardPay:0,overtime:0,bonus:0,inss:0,absences:0,advance:0,advance15:0,loan:0,fines:0,thirteenthFirst:100000,thirteenthFirstDeduction:20000};
 const input={monthly:[],sales:[],academyInvoices:[],fuel:[],oil:[],maintenance:[],fines:[],payroll:[{...payroll,thirteenthDeductionsEnabled:false}]};
 assert.equal(buildCashForecast(input,'2026-11-01','2026-11-30').totals.outExpected,100000);
 input.payroll=[{...payroll,thirteenthDeductionsEnabled:true}];assert.equal(buildCashForecast(input,'2026-11-01','2026-11-30').totals.outExpected,80000);
});

test('serviços entram uma vez e empréstimos concedidos são saídas, sem duplicar parcelas como receita',()=>{
 const input={monthly:[],sales:[],services:[{id:'s1',client:'Ana',date:'2026-10-10',amount:45000,payment:'PIX',status:'paid'},{id:'s2',client:'Bia',date:'2026-10-11',amount:70000,payment:'BOLETO',status:'pending'}],academyInvoices:[],fuel:[],oil:[],maintenance:[],payroll:[],fines:[],payrollLoans:[{id:'loan-1',employee:'Vasco',issuedDate:'2026-10-01',amount:100000,status:'active',installments:[]} as unknown as PayrollLoan]};
 const report=buildCashForecast(input,'2026-10-01','2026-10-31');assert.equal(report.totals.inConfirmed,45000);assert.equal(report.totals.inExpected,70000);assert.equal(report.totals.outConfirmed,100000);assert.equal(report.totals.balance,15000);assert.equal(new Set(report.rows.map(r=>r.id)).size,3);
 assert.equal(buildCashForecast(input,'2026-11-01','2026-11-30').rows.some(r=>r.id.startsWith('loan-issued')),false);
});

test('produtos e mensalidades não ficam simultaneamente previstos e confirmados',()=>{
 const input={monthly:[{id:'m1',kind:'Mensalidade',client:'Ana',period:'2026-10',date:'2026-10-05',amount:30000,payment:'PIX',status:'paid'}],sales:[{id:'s1',channel:'Clientes',client:'Ana',product:'Cloro',period:'2026-10',date:'2026-10-06',deliveryDate:'2026-10-06',deliveryStatus:'delivered',total:26500,status:'paid'}],academyInvoices:[],fuel:[],oil:[],maintenance:[],payroll:[],fines:[]};
 const report=buildCashForecast(input,'2026-10-01','2026-10-31');assert.equal(report.rows.length,2);assert.equal(report.totals.inConfirmed,56500);assert.equal(report.totals.inExpected,0);assert.equal(buildCashForecast(input,'2026-02-30','2026-03-01').rows.length,0);
});
