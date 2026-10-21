import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollRollover} from './payroll-rollover.ts';

const september={id:'payroll-september',period:'2026-09',employee:'Esdras',version:4,baseSalary:249500,hazardPay:50000,overtime:37341,bonus:30000,inss:23383,absences:1000,advance:50000,loan:12000,fines:12711,advance15:99800,notes:'Empréstimo em andamento'};

test('copia todos os valores de setembro em outubro sem alterar o histórico',async()=>{
 const [month]=await payrollRollover([september],[],'2026-10');
 assert.equal(month.period,'2026-10');
 const copy=month.items[0];
 assert.deepEqual(copy,{...september,id:copy.id,period:'2026-10',version:1});
 assert.match(copy.id,/^payroll-recurring-2026-10-[a-f0-9]{32}$/);
 assert.equal(september.period,'2026-09');
 const [again]=await payrollRollover([september],[],'2026-10');
 assert.equal(again.items[0].id,copy.id);
});

test('preserva ajustes manuais e não recria colaboradores excluídos de um mês já gerado',async()=>{
 const october={...september,id:'payroll-october',period:'2026-10',baseSalary:300000,bonus:0};
 const [month]=await payrollRollover([september,october],[],'2026-10');
 assert.equal(month.items.length,0);
 assert.deepEqual(await payrollRollover([september],['2026-10'],'2026-10'),[]);
 const [november]=await payrollRollover([september,october],['2026-10'],'2026-11');
 assert.equal(november.items[0].baseSalary,300000);
 assert.equal(november.items[0].bonus,0);
 const [empty]=await payrollRollover([september],['2026-10'],'2026-11');
 assert.equal(empty.items.length,0);
});

test('preenche meses não acessados, atravessa o ano e não duplica nomes',async()=>{
 const december={...september,period:'2026-12'};
 const duplicate={...december,id:'payroll-duplicate',employee:'  ESDRAS  '};
 const months=await payrollRollover([december,duplicate],[],'2027-02');
 assert.deepEqual(months.map(month=>month.period),['2027-01','2027-02']);
 assert.deepEqual(months.map(month=>month.items.length),[1,1]);
 assert.equal(months[1].items[0].advance15,september.advance15);
 assert.deepEqual(await payrollRollover([],[],'2026-10'),[]);
});
