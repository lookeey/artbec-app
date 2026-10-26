import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseStaffFor,technicianExpenses} from './technician-expenses.ts';

const staff=expenseStaffFor([{id:'active',name:'Kevin Oliveira Martins',role:'Técnico',endDate:'',document:'private'},
 {id:'former',name:'Levi Silva',role:'Técnico',endDate:'2026-08-01'},
 {id:'office',name:'Letícia',role:'Administrativo',endDate:''}]);
const fuel=[{id:'current',date:'2026-10-26',technician:' KÉVIN ',amount:10000},
 {id:'full',date:'2026-10-02',technician:'Kevin Oliveira Martins',amount:2000},
 {id:'former',date:'2026-10-03',technician:'Levi',amount:90000},
 {id:'unknown',date:'2026-10-03',technician:'Simão',amount:80000},
 {id:'tomorrow',date:'2026-10-27',technician:'Kevin',amount:70000},
 {id:'november',date:'2026-11-03',technician:'Kevin',amount:60000},
 {id:'december',date:'2026-12-03',technician:'Kevin',amount:50000},
 {id:'invalid',date:'2026-02-31',technician:'Kevin',amount:40000}];
const oil=[{id:'oil',date:'2026-10-15',technician:'kevin',amount:3000},
 {id:'reading',date:'2026-10-15',technician:'Kevin',amount:100000,entryType:'reading' as const}];
test('active employee totals, ranking and graph exclude former staff, unknown names, invalid/future dates and KM readings',()=>{
 const result=technicianExpenses(fuel,oil,staff,'2026-10','2026-10-26');
 assert.deepEqual(staff,[{id:'active',name:'Kevin Oliveira Martins',active:true},{id:'former',name:'Levi Silva',active:false}]);
 assert.equal(result.total,15000);assert.equal(result.fuelTotal,12000);assert.equal(result.oilTotal,3000);
 assert.deepEqual(result.rows,[{name:'Kevin Oliveira Martins',gasoline:12000,lubricant:3000,total:15000,count:3}]);
 assert.deepEqual(result.monthTotals[9],{period:'2026-10',fuel:12000,oil:3000});
 assert.ok(result.monthTotals.slice(10).every(month=>month.fuel===0&&month.oil===0));
 for(const period of ['2026-11','2026-12'])for(const history of [false,true]){
  const future=technicianExpenses(fuel,oil,staff,period,'2026-10-26',history);assert.equal(future.total,0);assert.deepEqual(future.rows,[]);
 }
 assert.equal(fuel.length,8);assert.equal(oil.length,2);
});
test('history is available explicitly, new months use their own records and ambiguous short names are never assigned to another employee',()=>{
 assert.equal(technicianExpenses(fuel,oil,staff,'2026-10','2026-10-26',true).total,185000);
 assert.equal(technicianExpenses(fuel,oil,staff,'2026-11','2026-11-03').total,60000);
 assert.equal(technicianExpenses(fuel,oil,staff,'2026-11','2026-10-31').total,0);
 const ambiguous=[{id:'a',name:'Kevin Oliveira Martins',active:true},{id:'b',name:'Kevin Silva',active:false}];
 assert.equal(technicianExpenses(fuel,[],ambiguous,'2026-10','2026-10-26').total,2000);
 assert.equal(technicianExpenses(fuel,oil,[],'2026-10','2026-10-26').total,0);
});
