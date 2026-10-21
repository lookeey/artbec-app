import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFineDeductions} from './fine-payroll.ts';

test('distribui centavos pelas parcelas e desconta nos meses escolhidos',()=>{
 const deductions=calculateFineDeductions([{id:'fine-1',technician:'João Silva',description:'Infração',amount:10001,status:'pending',installments:3,deductFromPayroll:true,payrollStartPeriod:'2026-12'}],[{employee:'João Silva',period:'2026-12'},{employee:'João Silva',period:'2027-01'},{employee:'João Silva',period:'2027-02'}]);
 assert.deepEqual(deductions.map(item=>[item.period,item.amount]),[['2026-12',3334],['2027-01',3334],['2027-02',3333]]);
});

test('não desconta multas em recurso nem associa primeiro nome ambíguo',()=>{
 const payroll=[{employee:'Ana Maria',period:'2026-09'},{employee:'Ana Clara',period:'2026-09'}];
 const fines=[{id:'fine-1',technician:'Ana',description:'Infração',amount:5000,status:'pending',deductFromPayroll:true,payrollStartPeriod:'2026-09'},{id:'fine-2',technician:'Ana Maria',description:'Recurso',amount:3000,status:'appeal',deductFromPayroll:true,payrollStartPeriod:'2026-09'}];
 assert.deepEqual(calculateFineDeductions(fines,payroll),[]);
});
