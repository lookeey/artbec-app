import test from 'node:test';
import assert from 'node:assert/strict';
import {isTaskLate,sortOpenTasks,taskProgress,type ResolutionTask} from './resolution-task.ts';

const task=(id:string,dueDate:string,priority:ResolutionTask['priority'],status:ResolutionTask['status']='open'):ResolutionTask=>({id,version:1,title:id,detail:'',category:'Operação',priority,owner:'',dueDate,status,steps:[],resolution:'',createdAt:'2026-10-01T10:00:00Z',createdBy:'Letícia',updatedAt:'',resolvedAt:'',resolvedBy:''});

test('pendências vencidas aparecem antes das demais e resolvidas não ficam atrasadas',()=>{
 const items=[task('normal','2026-10-15','high'),task('late','2026-10-01','low'),task('soon','2026-10-05','medium')];
 assert.deepEqual(sortOpenTasks(items,'2026-10-02').map(item=>item.id),['late','normal','soon']);
 assert.equal(isTaskLate(task('done','2026-10-01','high','done'),'2026-10-02'),false);
});

test('progresso reflete as etapas marcadas',()=>{
 const item={...task('steps','','medium'),steps:[{id:'1',text:'Verificar',done:true},{id:'2',text:'Resolver',done:false}]};
 assert.deepEqual(taskProgress(item),{total:2,done:1,percent:50});
});
