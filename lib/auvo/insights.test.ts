import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPerformanceInsights,recordedMinutes,previousPeriod,type InsightTask} from './insights.ts';

const task=(id:number,day:string,start:string|null,end:string|null,extra:Partial<InsightTask>={}):InsightTask=>({auvoId:id,auvoUserId:1,userName:'Esdras',customerId:10,customerName:'Piscina A',taskTypeDescription:'Limpeza',taskDate:day+'T08:00:00',taskStatus:5,arrivalDate:start?`${day}T${start}:00-03:00`:null,departureDate:end?`${day}T${end}:00-03:00`:null,...extra});
test('exige pares válidos de horários e períodos anteriores de mesma duração',()=>{
 assert.equal(recordedMinutes(task(1,'2026-10-01','08:00','08:25')),25);
 assert.equal(recordedMinutes(task(1,'2026-10-01',null,'08:25')),null);
 assert.equal(recordedMinutes(task(1,'2026-10-01','09:00','08:25')),null);
 assert.deepEqual(previousPeriod({start:'2026-10-01',end:'2026-10-03'}),{start:'2026-09-28',end:'2026-09-30'});
});
test('compara o mesmo cliente e serviço e só calcula média de finalizados com horários',()=>{
 const history=[task(1,'2026-09-28','08:00','08:20'),task(2,'2026-09-29','08:00','09:00',{taskTypeDescription:'Reparo'}),task(3,'2026-10-01','08:00','08:30'),task(4,'2026-10-01',null,null),task(5,'2026-10-02','08:00','12:00',{taskStatus:1})];
 const result=buildPerformanceInsights(history,{start:'2026-10-01',end:'2026-10-03'},null,'2026-10-04');
 assert.equal(result.technicians[0].averageMinutes,30);
 assert.equal(result.technicians[0].timingSamples,1);
 assert.equal(result.technicians[0].coverage,50);
 assert.equal(result.technicians[0].visitChange,0);
 assert.equal(result.pools[0].baselineMinutes,20);
 assert.equal(result.pools[0].change,10);
 assert.equal(result.alerts.length,2);
 assert.equal(result.alerts[0].reasons[0],'Horários ausentes ou inválidos');
});
test('separa técnicos e dias, calcula intervalos e detecta sobreposição',()=>{
 const rows=[task(1,'2026-10-01','08:00','08:30'),task(2,'2026-10-01','09:00','09:30'),task(3,'2026-10-01','09:20','09:40'),task(4,'2026-10-01','10:00','10:30',{auvoUserId:2,userName:'Murilo'}),task(5,'2026-10-02','08:00','08:30')];
 const result=buildPerformanceInsights(rows,{start:'2026-10-01',end:'2026-10-02'});
 assert.equal(result.timeline.find(item=>item.id===2)?.gapMinutes,30);
 assert.equal(result.timeline.find(item=>item.id===3)?.overlap,true);
 assert.equal(result.timeline.find(item=>item.id===4)?.gapMinutes,null);
 assert.equal(result.timeline.find(item=>item.id===5)?.gapMinutes,null);
 assert.equal(buildPerformanceInsights(rows,result.period,'2').technicians.length,1);
});
test('marca atendimento curto e longo, sem inventar evolução quando não há dados atuais',()=>{
 const rows=[task(1,'2026-09-30','08:00','08:30'),task(2,'2026-10-01','08:00','08:04'),task(3,'2026-10-01','09:00','12:00')];
 const result=buildPerformanceInsights(rows,{start:'2026-10-01',end:'2026-10-01'});
 assert.equal(result.alerts.length,2);
 assert.match(result.alerts[0].reasons[0],/5 minutos/);
 assert.match(result.alerts[1].reasons[0],/referência/);
 assert.equal(buildPerformanceInsights([rows[0]],result.period).technicians[0].visitChange,null);
 assert.deepEqual(buildPerformanceInsights([],result.period).technicians,[]);
});
