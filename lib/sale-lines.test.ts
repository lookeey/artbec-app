import test from 'node:test';
import assert from 'node:assert/strict';
import {saleLinesTotal,saleLinesTotalFor,hasUnpricedVitaTreatment,allowsUnpricedVitaTreatment} from './sale-lines.ts';
const sale={id:'sale-v-abr-vita-15',channel:'Vita',period:'2026-04'};
const lines=[{product:'Algicida Choque HTH',quantity:2,unitPrice:4500},{product:'Tratamento Semanal',quantity:2,unitPrice:null}];

test('histórico Vita soma somente os produtos com preço sem transformar o tratamento em grátis',()=>{
 assert.equal(saleLinesTotal(lines),null);assert.equal(saleLinesTotalFor(sale,lines),9000);
 assert.equal(hasUnpricedVitaTreatment(sale,lines),true);assert.equal(lines[1].unitPrice,null);
 assert.equal(saleLinesTotalFor(sale,[lines[1]]),null);
});
test('demais vendas, produtos, competências e quantidades incompletas continuam bloqueados',()=>{
 for(const invalid of [{...sale,id:'sale-ordinary'}, {...sale,channel:'Clientes'},{...sale,period:'2026-10'}])assert.equal(saleLinesTotalFor(invalid,lines),null);
 assert.equal(saleLinesTotalFor(sale,[lines[0],{...lines[1],product:'Cloro líquido 5 L'}]),null);
 assert.equal(saleLinesTotalFor(sale,[lines[0],{...lines[1],quantity:null}]),null);
 assert.equal(allowsUnpricedVitaTreatment(sale,'Tratamento Semanal'),true);
 assert.equal(allowsUnpricedVitaTreatment(sale,'Outro produto'),false);
});
test('preenchimento posterior do tratamento volta a somar seu preço normalmente',()=>{
 const complete=[lines[0],{...lines[1],unitPrice:3000}];
 assert.equal(saleLinesTotalFor(sale,complete),15000);assert.equal(hasUnpricedVitaTreatment(sale,complete),false);
 assert.equal(saleLinesTotalFor({...sale,id:'sale-normal'},complete),15000);
 assert.equal(saleLinesTotal([{product:'Item fracionado',quantity:1.5,unitPrice:101}]),152);
});
