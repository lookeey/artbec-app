import {test} from 'node:test';
import assert from 'node:assert/strict';
// Node runs TypeScript directly for this test suite.
import {gpsDistance,travelMetrics,timestamp} from './travel-metrics.ts';
const p=(time:string,longitude:number)=>({userId:1,positionDate:`2026-09-21T${time}:00`,latitude:-23.5,longitude});
test('missing or rejected GPS is unknown, never a misleading zero',()=>{
 assert.equal(gpsDistance([]).km,null);
 assert.equal(gpsDistance([p('10:00',-46.6),p('10:30',-46.59)]).km,null);
 assert.equal(gpsDistance([p('10:00',-46.6),p('10:01',-40)]).km,null);
 assert.equal(gpsDistance([p('10:00',-46.6),p('10:05',-46.6)]).km,0);
});
test('preserves agenda order and measures only GPS within real inter-visit times',()=>{
 const visits=[{id:2,name:'B',taskDate:'2026-09-21T11:00:00',arrivalDate:'2026-09-21T10:10:00',departureDate:null},{id:1,name:'A',taskDate:'2026-09-21T09:00:00',arrivalDate:null,departureDate:'2026-09-21T10:00:00'}];
 const points=[p('07:00',-46.7),p('07:05',-46.69),p('10:00',-46.6),p('10:05',-46.59),p('10:10',-46.58)];
 const result=travelMetrics(visits,points);
 assert.deepEqual(result.ordered.map((v:{id:number})=>v.id),[1,2]);
 assert.equal(result.coveredLegs,1);assert.equal(result.intervalMinutes,10);
 assert.ok(result.daily.km!>result.betweenKm!);
 assert.equal(result.betweenKm,gpsDistance(points,timestamp(visits[1].departureDate),timestamp(visits[0].arrivalDate)).km);
});
test('agenda times alone and reversed real times cannot imply route distance',()=>{
 const visits=[{id:1,name:'A',taskDate:'2026-09-21T09:00:00',arrivalDate:null,departureDate:null},{id:2,name:'B',taskDate:'2026-09-21T10:00:00',arrivalDate:null,departureDate:null}];
 assert.equal(travelMetrics(visits,[p('10:00',-46.6),p('10:05',-46.59)]).betweenKm,null);
 visits[0].departureDate='2026-09-21T11:00:00' as never;visits[1].arrivalDate='2026-09-21T10:00:00' as never;
 assert.equal(travelMetrics(visits,[p('10:00',-46.6),p('10:05',-46.59)]).betweenKm,null);
});
