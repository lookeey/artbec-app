import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateOccurrences,occurrenceDate,type MaintenancePlan} from './preventive-maintenance.ts';

test('recorrência mensal preserva o dia sem ultrapassar meses curtos',()=>{
 assert.equal(occurrenceDate('2026-01-31',1,1),'2026-02-28');
 assert.equal(occurrenceDate('2026-01-31',1,2),'2026-03-31');
});
test('tarefa concluída permanece no histórico e a próxima é gerada',()=>{
 const id='maintenancePlan-00000000-0000-4000-8000-000000000001';
 const plan:MaintenancePlan={id,version:1,clientId:'c1',clientName:'Cliente',title:'Troca de areia',kind:'sand',firstDueDate:'2026-09-15',frequencyMonths:1,owner:'Técnico',notes:'',active:true};
 const first=`maintenanceOccurrence-${id.slice('maintenancePlan-'.length)}-2026-09-15`;
 const tasks=generateOccurrences([plan],new Map([[first,'2026-09-15T12:00:00Z']]),'2026-10-31');
 assert.deepEqual(tasks.map(item=>[item.dueDate,item.done]),[['2026-09-15',true],['2026-10-15',false]]);
});
