import test from 'node:test';
import assert from 'node:assert/strict';
import {businessToday,currentPeriod,nextPeriod,periodOptions,moveDueDate} from './month-rollover.ts';

test('usa a data de São Paulo na virada do mês',()=>{
 const instant=new Date('2026-10-01T01:30:00Z');
 assert.equal(businessToday(instant),'2026-09-30');
 assert.equal(currentPeriod(instant),'2026-09');
 assert.equal(currentPeriod(new Date('2026-10-01T03:30:00Z')),'2026-10');
});

test('inclui o mês atual e lacunas sem lançamentos',()=>{
 assert.deepEqual(periodOptions(['2026-08','2026-09'],'2026-10'),['2026-10','2026-09','2026-08']);
 assert.deepEqual(periodOptions(['2026-11'],'2027-01'),['2027-01','2026-12','2026-11']);
 assert.equal(nextPeriod('2026-12'),'2027-01');
});

test('mantém o dia de vencimento quando o mês é mais curto',()=>{
 assert.equal(moveDueDate('2026-01-31','2026-02'), '2026-02-28');
 assert.equal(moveDueDate('2026-02-28','2026-03',31), '2026-03-31');
 assert.equal(moveDueDate('2028-01-31','2028-02'), '2028-02-29');
});
