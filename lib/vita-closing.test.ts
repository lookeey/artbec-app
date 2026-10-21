import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeVitaHalf} from './vita-closing.ts';

const sale=(id:string,date:string,product:string,quantity:number|null,total:number)=>({id,date,period:'2026-09',client:'Vita Morumbi',product,quantity,total});

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
