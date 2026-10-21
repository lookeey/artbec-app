import assert from 'node:assert/strict';
import {test} from 'node:test';
import {purchaseSuggestions} from './purchase-suggestions.ts';

test('sugere reposição pelo mínimo e consumo recente sem contar entregas futuras',()=>{
 const result=purchaseSuggestions([{id:'a',product:'Cloro',minimum:5}],[{id:'a',product:'Cloro',available:4,delivered:0}],
  [{productId:'a',quantity:6,date:'2026-09-10'}],
  [{deliveryStatus:'delivered',deliveredAt:'2026-09-20',stockItems:[{productId:'a',quantity:4}]},{deliveryStatus:'pending',deliveryDate:'2026-10-03',stockItems:[{productId:'a',quantity:50}]}],
  '2026-10-02');
 assert.equal(result[0].consumed60,10);
 assert.equal(result[0].suggested,6);
 assert.equal(result[0].urgent,true);
});
