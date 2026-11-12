import test from 'node:test';
import assert from 'node:assert/strict';
import {profitabilityAdjustmentSchema,showLegacyHoursInFirstWeek} from './profitability-adjustments.ts';

test('mostra as horas antigas na semana 1 de novembro sem duplicar o total',()=>{
 const parsed=profitabilityAdjustmentSchema.parse({
  id:'profitability-2026-11',version:1,period:'2026-11',customers:{},
  technicians:{nico:{visits:null,hours:38,revenueUnassigned:null,payrollCost:null,fuelCost:null,oilCost:null,maintenanceCost:null,otherCost:null}},
 });
 const migrated=showLegacyHoursInFirstWeek(parsed);
 assert.deepEqual(migrated.technicians.nico.weeklyHours,[38,null,null,null,null]);
 assert.equal(migrated.technicians.nico.hours,38);
 assert.equal(migrated.technicians.nico.weeklyHours.reduce<number>((sum,value)=>sum+(value??0),0),38);
 assert.deepEqual(parsed.technicians.nico.weeklyHours,[null,null,null,null,null]);
});

test('não altera horas semanais já informadas nem outras competências',()=>{
 const base=profitabilityAdjustmentSchema.parse({
  id:'profitability-2026-11',version:1,period:'2026-11',customers:{},
  technicians:{nico:{visits:null,hours:38,weeklyHours:[40,null,null,null,null],revenueUnassigned:null,payrollCost:null,fuelCost:null,oilCost:null,maintenanceCost:null,otherCost:null}},
 });
 assert.deepEqual(showLegacyHoursInFirstWeek(base).technicians.nico.weeklyHours,[40,null,null,null,null]);
 const october={...base,id:'profitability-2026-10',period:'2026-10'};
 assert.strictEqual(showLegacyHoursInFirstWeek(october),october);
});
