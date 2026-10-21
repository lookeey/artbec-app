import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStaffStartDate,staffStartInput,staffTenure} from './staff-tenure.ts';

test('interpreta datas da planilha e mantém o início ao editar',()=>{
 assert.equal(staffStartInput('07 de Maio de 2025'),'2025-05-07');
 assert.equal(staffStartInput('Março de 2024'),'2024-03-01');
 assert.equal(parseStaffStartDate('Março de 2024')?.approximate,true);
 assert.equal(staffStartInput('2026-02-30'),'');
});

test('calcula tempo de casa por dia e marca datas de mês aproximado',()=>{
 const today=new Date(2026,9,2);
 assert.equal(staffTenure('2025-05-07',today),'1 ano e 4 meses');
 assert.equal(staffTenure('Março de 2024',today),'Cerca de 2 anos e 7 meses');
 assert.equal(staffTenure('2026-09-26',today),'6 dias');
 assert.equal(staffTenure('2026-10-03',today),'Início no futuro');
});
