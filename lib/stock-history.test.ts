import test from 'node:test';
import assert from 'node:assert/strict';
import {stockHistory} from './stock-history.ts';

test('separa entradas e saídas por data real e mantém o legado sem data, sem duplicar entregas',()=>{
 const products=[{id:'stock-a',product:'Cloro',incoming:15,outgoing:4}];
 const audit=[
  {sequence:1,record_id:'stock-a',at:'2026-10-01T02:30:00Z',before_data:JSON.stringify({incoming:10,outgoing:2}),after_data:JSON.stringify({incoming:16,outgoing:2})},
  {sequence:2,record_id:'stock-a',at:'2026-10-24T12:00:00Z',before_data:JSON.stringify({incoming:16,outgoing:2}),after_data:JSON.stringify({incoming:15,outgoing:4})},
  {sequence:3,record_id:'stock-a',at:'2026-10-24T12:01:00Z',before_data:JSON.stringify({incoming:15,outgoing:4}),after_data:JSON.stringify({incoming:15,outgoing:4,imageKey:'photo'})},
 ];
 const movements=[{id:'withdrawal',productId:'stock-a',product:'Nome antigo',quantity:3,date:'2026-10-03',technician:'Simão'}];
 const sales=[{id:'sale',deliveryStatus:'delivered',deliveredAt:'2026-09-30',stockItems:[{productId:'stock-a',quantity:2}]},
  {id:'pending',deliveryStatus:'pending',deliveredAt:'2026-10-03',stockItems:[{productId:'stock-a',quantity:10}]},
  {id:'regularized',deliveryStatus:'delivered',deliveredAt:'',stockItems:[]}];
 const entries=stockHistory(products,movements,sales,audit);
 const sum=(period:string,direction:string)=>entries.filter(e=>e.date.startsWith(period)&&e.direction===direction).reduce((sum,e)=>sum+e.quantity,0);
 assert.equal(sum('2026-09','in'),6); assert.equal(sum('2026-09','out'),2);
 assert.equal(sum('2026-10','in'),0); assert.equal(sum('2026-10','out'),6);
 assert.equal(entries.find(e=>e.id==='audit-1-incoming')?.date,'2026-09-30');
 assert.equal(entries.find(e=>e.id==='audit-2-incoming')?.description,'Correção de entrada');
 assert.equal(entries.find(e=>e.id==='undated-stock-a-incoming')?.quantity,10);
 assert.equal(entries.find(e=>e.id==='undated-stock-a-outgoing')?.quantity,2);
 assert.ok(entries.every(e=>e.product==='Cloro'));
 assert.equal(entries.length,7);
});

test('novos registros, correções e registros sem data válida não inventam meses ou saídas de estoque',()=>{
 const products=[{id:'new',product:'Novo',incoming:3,outgoing:1}];
 const audit=[{sequence:1,record_id:'new',at:'2026-10-24T12:00:00Z',before_data:null,after_data:JSON.stringify({initial:20,incoming:3,outgoing:1})}];
 const entries=stockHistory(products,[{id:'invalid',productId:'new',product:'Novo',quantity:2,date:'2026-02-31',technician:'Teste'}],[{id:'no-actual-date',deliveryStatus:'delivered',stockItems:[{productId:'new',quantity:1}]}],audit);
 assert.deepEqual(entries.map(e=>[e.date,e.direction,e.quantity]),[['2026-10-24','in',3],['2026-10-24','out',1],['','out',1],['','out',2]]);
 assert.ok(entries.every(e=>e.quantity!==20));
 const correction=stockHistory([{id:'new',product:'Novo',incoming:0,outgoing:1}],[],[],[{sequence:2,record_id:'new',at:'2026-11-02T12:00:00Z',before_data:'{"incoming":0,"outgoing":3}',after_data:'{"incoming":0,"outgoing":1}'}]);
 assert.equal(correction[0].direction,'in'); assert.equal(correction[0].quantity,2); assert.equal(correction[0].description,'Correção de saída');
 assert.equal(correction[1].quantity,3); assert.equal(correction[1].date,'');
 const initialCorrection=stockHistory([{id:'new',product:'Novo',incoming:0,outgoing:0}],[],[],[{sequence:3,record_id:'new',at:'2026-11-02T12:00:00Z',before_data:'{"initial":20}',after_data:'{"initial":17}'}]);
 assert.deepEqual(initialCorrection.map(e=>[e.direction,e.quantity,e.description]),[['out',3,'Correção do saldo inicial']]);
});
