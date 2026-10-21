import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHomeAlerts} from './home-alerts.ts';

test('alertas distinguem vencidos, entregas agendadas e tarefas sem responsável',()=>{
 const alerts=buildHomeAlerts({bills:[{kind:'Mensalidade',client:'Ana',date:'2026-10-01',status:'pending',amount:10000},{kind:'Mensalidade',client:'Bia',date:'2026-10-05',status:'pending',amount:10000},{kind:'Mensalidade',client:'Caio',date:'2026-09-01',status:'paid',amount:10000}],sales:[{client:'Ana',product:'Cloro',deliveryDate:'2026-10-01',date:'2026-09-30',deliveryStatus:'pending'},{client:'Bia',product:'Cloro',deliveryDate:'',date:'2026-09-30',deliveryStatus:'pending'}],tasks:[{title:'Resolver',owner:'',status:'open',dueDate:''},{title:'Feito',owner:'',status:'done',dueDate:''}]},'2026-10-02');
 assert.equal(alerts.find(item=>item.key==='monthly')?.count,1);
 assert.equal(alerts.find(item=>item.key==='monthly-soon')?.count,1);
 assert.equal(alerts.find(item=>item.key==='delivery')?.count,1);
 assert.equal(alerts.find(item=>item.key==='tasks')?.count,1);
});
