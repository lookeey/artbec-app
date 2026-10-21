import test from 'node:test';
import assert from 'node:assert/strict';
import {complaintWeekStart,moveComplaintDay,complaintsForWeek,pendingComplaints} from './complaint-week.ts';
import {buildHomeAlerts} from './home-alerts.ts';
const row=(id:string,date:string,status='open',archived=false)=>({id,clientName:'Cliente '+id,title:'Timer',occurredOn:date,status:status as 'open'|'resolved'|'waiting',archived,dueOn:'',priority:'normal' as const});
test('semana segunda a domingo cruza meses e anos sem perder domingo',()=>{
 assert.equal(complaintWeekStart('2027-01-03'),'2026-12-28');
 assert.equal(moveComplaintDay('2026-12-28',6),'2027-01-03');
 const items=[row('a','2026-12-27'),row('b','2026-12-28'),row('c','2027-01-03','resolved'),row('d','2027-01-04'),row('e','2026-12-30','open',true),row('f','2026-12-29','waiting')];
 assert.deepEqual(complaintsForWeek(items,'2026-12-28').map(c=>c.id),['b','f','c']);
 assert.deepEqual(complaintsForWeek(items,'2026-12-28','unresolved').map(c=>c.id),['b','f']);
 assert.deepEqual(complaintsForWeek(items,'2026-12-28','resolved').map(c=>c.id),['c']);
});
test('alertas carregam pendências antigas e somem após a baixa; prazos vencidos primeiro',()=>{
 const old=row('old','2026-08-01'),late={...row('late','2026-10-14'),dueOn:'2026-10-14'};
 const items=[old,row('done','2026-10-13','resolved'),row('archive','2026-10-12','open',true),late,row('future','2026-10-20')];
 assert.deepEqual(pendingComplaints(items,'2026-10-15').map(c=>c.id),['late','old']);
 const alert=buildHomeAlerts({complaints:items},'2026-10-15').find(g=>g.key==='complaints')!;
 assert.equal(alert.count,2);assert.equal(alert.tone,'red');assert.match(alert.items[0].detail,/Timer.*Prazo vencido/);
 assert.equal(buildHomeAlerts({},'2026-10-15').some(g=>g.key==='complaints'),false);
 assert.equal(pendingComplaints(items.map(c=>({...c,status:'resolved' as const})),'2026-10-15').length,0);
});
