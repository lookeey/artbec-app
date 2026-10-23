import test from 'node:test';
import assert from 'node:assert/strict';
import {stockAvailability,suggestedDeliveryItems} from './stock-delivery.ts';

const stock=[{id:'stock-a',product:'Clarificante',initial:10,incoming:2,outgoing:1},{id:'stock-b',product:'Cloro 3 em 1',initial:5,incoming:0,outgoing:0}];

test('uma entrega vinculada reduz o estoque uma vez; ao reabrir, devolve',()=>{
 const sale={id:'sale-a',deliveryStatus:'delivered',stockItems:[{productId:'stock-a',quantity:3}]};
 assert.equal(stockAvailability(stock,[{productId:'stock-a',quantity:2}],[sale])[0].available,6);
 assert.equal(stockAvailability(stock,[{productId:'stock-a',quantity:2}],[{...sale,deliveryStatus:'pending'}])[0].available,9);
});

test('entregas antigas sem vínculo não são descontadas retroativamente',()=>{
 assert.equal(stockAvailability(stock,[],[{id:'sale-old',deliveryStatus:'delivered'}])[0].available,11);
});

test('só sugere correspondências exatas e mantém a quantidade informada',()=>{
 const available=stockAvailability(stock,[],[]);
 assert.deepEqual(suggestedDeliveryItems('3 Clarificantes',null,available),[{productId:'',quantity:3}]);
 assert.deepEqual(suggestedDeliveryItems('2 Clarificante',null,available),[{productId:'stock-a',quantity:2}]);
 assert.deepEqual(suggestedDeliveryItems('Cloro',1,available),[{productId:'',quantity:1}]);
});

test('um produto composto cadastrado é vinculado inteiro antes de separar quantidades',()=>{
 const kits=stockAvailability([{id:'stock-kit',product:'5 Metros de mangueira e 3 ponteiras',initial:5,incoming:0,outgoing:0}],[],[]);
 assert.deepEqual(suggestedDeliveryItems('5 Metros de mangueira e 3 ponteiras',null,kits),[{productId:'stock-kit',quantity:1}]);
 assert.deepEqual(suggestedDeliveryItems('5 metros de mangueira e 3 ponteiras',2,kits),[{productId:'stock-kit',quantity:2}]);
 assert.deepEqual(suggestedDeliveryItems('5 Metros de mangueira e 3 ponteiras',1,[...kits,{...kits[0],id:'stock-duplicate'}]),[{productId:'',quantity:1}]);
 const sale={id:'sale-kit',deliveryStatus:'delivered',stockItems:suggestedDeliveryItems(kits[0].product,null,kits)};
 assert.equal(stockAvailability([{id:'stock-kit',product:kits[0].product,initial:5,incoming:0,outgoing:0}],[],[sale])[0].available,4);
});
