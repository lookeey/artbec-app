import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMetrics} from './metrics.ts';
import {AuvoTaskStatus} from './types.ts';

test('calcula indicadores usando apenas os estados documentados',()=>{const tasks=[{taskStatus:AuvoTaskStatus.Finished,customerId:1},{taskStatus:AuvoTaskStatus.Finished,customerId:1},{taskStatus:AuvoTaskStatus.CheckedIn,customerId:2},{taskStatus:AuvoTaskStatus.Paused,customerId:3},{taskStatus:AuvoTaskStatus.Opened,customerId:null}],metrics=calculateMetrics(tasks);assert.deepEqual(metrics,{scheduled:5,finished:2,inProgress:1,paused:1,pending:3,customers:1,completionRate:40})});
test('período sem tarefas não produz divisão inválida',()=>{assert.equal(calculateMetrics([]).completionRate,0)});
