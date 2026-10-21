import test from 'node:test';
import assert from 'node:assert/strict';
import {groupComplaintsByClient,complaintMutation,applyComplaintMutation,complaintRankings,validComplaintDate,type Complaint,type ComplaintFields} from './complaints.ts';
const id='complaint-11111111-1111-4111-8111-111111111111',actor={id:'leticia',name:'Letícia'},today='2026-10-15',now=today+'T13:00:00Z';
const fields:ComplaintFields={clientId:'client-1',clientName:'Ana',title:'Água turva',description:'Cliente relatou água turva após a visita.',occurredOn:'2026-10-14',category:'Qualidade da água',priority:'normal',owner:'Esdras',dueOn:'2026-10-16'};
const create=()=>applyComplaintMutation(null,complaintMutation.parse({action:'save',id,version:0,fields}),actor,now,today,'event-1');
test('creation attributes history to authenticated actor and ignores no client-supplied history',()=>{
 const item=create();assert.equal(item.createdBy,'Letícia');assert.equal(item.status,'open');assert.equal(item.version,1);assert.equal(item.events[0].detail,fields.description);
 assert.equal(complaintMutation.safeParse({action:'save',id,version:0,fields,events:[],createdBy:'Outro'}).success,false);
});
test('resolution requires a real date and a written solution; reopening preserves earlier resolution',()=>{
 const item=create();assert.equal(complaintMutation.safeParse({action:'followup',id,version:1,status:'resolved',message:' ',resolvedOn:today}).success,false);
 const done=applyComplaintMutation(item,{action:'followup',id,version:1,status:'resolved',message:'Bomba revisada e água tratada.',resolvedOn:today},actor,now,today,'event-2');
 const reopened=applyComplaintMutation(done,{action:'followup',id,version:2,status:'open',message:'Cliente informou nova alteração.',resolvedOn:''},{id:'mari',name:'Marilene'},now,today,'event-3');
 assert.equal(item.events.length,1);assert.equal(done.events.length,2);assert.equal(reopened.events.length,3);assert.equal(reopened.events[1].detail,done.resolution);assert.equal(reopened.events[2].action,'reopened');assert.equal(reopened.events[2].by,'Marilene');assert.equal(reopened.status,'open');
 assert.throws(()=>applyComplaintMutation(item,{action:'followup',id,version:1,status:'resolved',message:'Resolvido',resolvedOn:'2026-10-13'},actor,now,today,'x'));
 assert.throws(()=>applyComplaintMutation(item,{action:'followup',id,version:1,status:'resolved',message:'Resolvido',resolvedOn:'2026-10-16'},actor,now,today,'x'));
});
test('edits retain original report and record changed values in the timeline',()=>{
 const original=create(),edited=applyComplaintMutation(original,{action:'save',id,version:1,fields:{...fields,description:'Novo detalhe informado pelo cliente',owner:'Kevin'}},actor,now,today,'event-2');
 assert.equal(edited.events[0].detail,fields.description);assert.match(edited.events[1].detail,/Kevin/);assert.match(edited.events[1].detail,/Novo detalhe/);assert.equal(edited.createdAt,original.createdAt);
});
test('ranking counts complaints once, sorts descending and excludes archived records',()=>{
 const first=create(),same=applyComplaintMutation(first,{action:'followup',id,version:1,status:'in_progress',message:'Visita agendada',resolvedOn:''},actor,now,today,'e2');
 const second={...create(),id:'second',category:'Limpeza'} as Complaint,third={...create(),id:'third',clientId:'client-2',clientName:'Bia',category:'Limpeza'} as Complaint,archived={...create(),id:'archived',archived:true};
 const ranking=complaintRankings([same,second,third,archived]);assert.equal(ranking.motives[0].label,'Limpeza');assert.equal(ranking.motives[0].count,2);assert.equal(ranking.clients[0].label,'Ana');assert.equal(ranking.clients[0].count,2);assert.equal(ranking.motives.reduce((n,r)=>n+r.count,0),3);
});
test('archive preserves history and blocks further edits until restored',()=>{
 const item=create(),archived=applyComplaintMutation(item,{action:'archive',id,version:1,archived:true},actor,now,today,'a');
 assert.equal(archived.events.length,2);assert.throws(()=>applyComplaintMutation(archived,{action:'save',id,version:2,fields},actor,now,today,'b'));
 const restored=applyComplaintMutation(archived,{action:'archive',id,version:2,archived:false},actor,now,today,'c');assert.equal(restored.archived,false);assert.equal(restored.events.length,3);
});
test('calendar dates cannot silently roll over to another month',()=>{assert.equal(validComplaintDate('2026-02-30'),false);assert.equal(validComplaintDate('2024-02-29'),true);assert.equal(validComplaintDate('2026-02-29'),false)});
test('custom categories are accepted, reusable and grouped without case or accent duplicates',()=>{
 const parsed=complaintMutation.parse({action:'save',id,version:0,fields:{...fields,category:'  Falha   no timer  '}});
 assert.equal(parsed.action,'save');if(parsed.action!=='save')throw Error('Expected save');
 assert.equal(parsed.fields.category,'Falha no timer');
 const custom=applyComplaintMutation(null,parsed,actor,now,today,'custom');
 const other={...custom,id:'another',category:'falha no TIMER'};
 assert.equal(complaintRankings([custom,other]).motives[0].count,2);
 assert.equal(complaintMutation.safeParse({action:'save',id,version:0,fields:{...fields,category:'  '}}).success,false);
});
test('client cards group occurrences without losing history or changing ranking counts',()=>{
 const same=create(),another={...create(),id:'other',title:'Timer com defeito',occurredOn:'2026-10-15'},otherClient={...create(),id:'third',clientId:'client-2',clientName:'Beatriz'};
 const groups=groupComplaintsByClient([same,otherClient,another]);
 assert.equal(groups.length,2);assert.equal(groups[0].name,'Ana');assert.equal(groups[0].cases.length,2);assert.equal(groups[0].cases[0].title,'Timer com defeito');assert.equal(groups[1].name,'Beatriz');
 assert.equal(complaintRankings([same,another,otherClient]).clients[0].count,2);
 assert.equal(groupComplaintsByClient([same]).length,1);
});
