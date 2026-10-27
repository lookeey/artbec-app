import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeVitaHalf,summarizeVitaMonth,vitaSalesForMonth} from './vita-closing.ts';

const sale=(id:string,date:string,product:string,quantity:number|null,total:number)=>({id,date,deliveryDate:date,period:'2026-09',client:'Vita Morumbi',product,quantity,total});

test('separa o dia 15 do dia 16 e soma quantidades descritas no produto',()=>{
 const sales=[sale('1','2026-09-01','4 Cloros e 2 Redutores de Ph',null,10000),sale('2','2026-09-15','3 Cloros',null,6000),sale('3','2026-09-16','Cloro Granulado',2,4000),sale('4','2026-09-30','1 Redutor de Ph',null,2000)];
 const first=summarizeVitaHalf(sales,'2026-09','Vita Morumbi','first'),second=summarizeVitaHalf(sales,'2026-09','Vita Morumbi','second');
 assert.equal(first.count,2);assert.equal(first.total,16000);assert.deepEqual(first.products.map(item=>item.quantity),[7,2]);
 assert.equal(second.count,2);assert.equal(second.total,6000);assert.deepEqual(second.products.map(item=>item.quantity),[2,1]);
});

test('sinaliza saída sem data para não fechar com produto omitido',()=>{
 const result=summarizeVitaHalf([sale('1','','2 Cloros',null,1000)],'2026-09','Vita Morumbi','first');
 assert.equal(result.undated,1);assert.equal(result.count,0);
});


test('entrega define a quinzena e o mês mesmo quando a venda tem outra competência',()=>{
 const sales=[{...sale('1','2026-09-01','Cloro',2,4000),deliveryDate:'2026-09-16'}, {...sale('2','2026-09-30','Cloro',3,6000),deliveryDate:'2026-10-15'}, {...sale('3','2026-09-01','Cloro',99,99),client:'Outra unidade'}];
 assert.equal(summarizeVitaHalf(sales,'2026-09','Vita Morumbi','first').count,0);
 assert.equal(summarizeVitaHalf(sales,'2026-09','Vita Morumbi','second').total,4000);
 assert.equal(summarizeVitaHalf(sales,'2026-10','Vita Morumbi','first').total,6000);
 assert.deepEqual(vitaSalesForMonth(sales,'2026-10','Vita Morumbi').map(item=>item.id),['2']);
 assert.deepEqual(summarizeVitaMonth(sales,'2026-10','Vita Morumbi').products,[{name:'Cloro',quantity:3}]);
});

test('data da venda não substitui entrega ausente ou inválida e bloqueia o fechamento',()=>{
 const sales=['','2026-09-31','2026-02-29','data inválida'].map((deliveryDate,index)=>({...sale(String(index),'2026-09-10','Cloro',1,1000),deliveryDate}));
 const original=structuredClone(sales);
 for(const half of ['first','second'] as const){const summary=summarizeVitaHalf(sales,'2026-09','Vita Morumbi',half);assert.equal(summary.undated,4);assert.equal(summary.count,0);assert.equal(summary.total,0)}
 assert.equal(vitaSalesForMonth(sales,'2026-09','Vita Morumbi').length,4);
 assert.equal(summarizeVitaMonth(sales,'2026-09','Vita Morumbi').count,0);
 assert.deepEqual(sales,original);
});

test('assinatura acompanha a entrega, preserva linhas e invalida fechamentos antigos',()=>{
 const item={...sale('1','2026-09-01','resumo antigo',null,9000),deliveryDate:'2026-09-15',lineItems:[{product:'Cloro',quantity:2,unitPrice:3000},{product:'Algicida',quantity:1,unitPrice:3000}]};
 const summary=summarizeVitaHalf([item],'2026-09','Vita Morumbi','first');
 assert.deepEqual(summary.products,[{name:'Algicida',quantity:1},{name:'Cloro',quantity:2}]);
 assert.match(summary.signature,/^delivery-date-v1:/);
 assert.equal(summarizeVitaHalf([{...item,date:'2026-09-30'}],'2026-09','Vita Morumbi','first').signature,summary.signature);
 assert.notEqual(summarizeVitaHalf([{...item,deliveryDate:'2026-09-14'}],'2026-09','Vita Morumbi','first').signature,summary.signature);
 assert.equal(summarizeVitaHalf([{...item,deliveryDate:'2026-09-16'}],'2026-09','Vita Morumbi','first').count,0);
 assert.equal(summarizeVitaHalf([{...item,deliveryDate:'2026-09-16'}],'2026-09','Vita Morumbi','second').total,9000);
});
