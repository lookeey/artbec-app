import test from 'node:test';
import assert from 'node:assert/strict';
import {customerRecordMatcher} from './customer-history.ts';
import {previousComparisonMonth,comparisonRange,comparisonMetric} from './executive-comparison.ts';
import {complaintMutation,applyComplaintMutation,type ComplaintFields} from './complaints.ts';
import {staffDeliverySchema,deliveryState,type StaffDelivery} from './staff-deliveries.ts';
import {buildHomeAlerts} from './home-alerts.ts';
test('ficha usa ID ou nome exato único e nunca aproxima nomes parecidos',()=>{
 const client={id:'c1',name:'José Silva'},customers=[client,{id:'c2',name:'José Silva Junior'}],matches=customerRecordMatcher(client,customers);
 assert.equal(matches({client:' JOSE   SILVA '}),true);assert.equal(matches({client:'José Silva Junior'}),false);
 assert.equal(matches({clientId:'c2',clientName:'José Silva'}),false);assert.equal(matches({clientId:'c1',clientName:'Nome antigo'}),true);
 assert.equal(customerRecordMatcher(client,[client,{id:'dup',name:'Jose Silva'}])({client:'Jose Silva'}),false);
});
test('comparações atravessam anos, limitam o último dia e não inventam porcentagem sobre zero',()=>{
 assert.equal(previousComparisonMonth('2027-01'),'2026-12');
 assert.deepEqual(comparisonRange('2028-02',true,'2028-03-31'),{start:'2028-02-01',end:'2028-02-29'});
 assert.equal(comparisonRange('2026-09',true,'2026-10-20').end,'2026-09-20');
 const row={id:'x',date:'2026-10-01',title:'Cliente',detail:'',amount:10000,status:'Pago'},m=comparisonMetric('x','Recebido','money','cash-flow',[row],[]);
 assert.equal(m.current,10000);assert.equal(m.percent,null);
 assert.equal(comparisonMetric('x','Recebido','money','cash-flow',[row],[{...row,amount:20000}]).percent,-50);
});
test('confirmação exige solução, data válida e nota; reabertura remove confirmação sem apagar o histórico',()=>{
 const id='complaint-11111111-1111-4111-8111-111111111111',actor={id:'a',name:'Letícia'},today='2026-10-20',now=today+'T12:00:00Z',fields:ComplaintFields={clientId:'c1',clientName:'Ana',title:'Timer',description:'Timer parado',occurredOn:'2026-10-18',category:'Timer',priority:'normal',owner:'Esdras',dueOn:''};
 const created=applyComplaintMutation(null,{action:'save',id,version:0,fields},actor,now,today,'e1');
 const confirm=complaintMutation.parse({action:'confirmClient',id,version:1,confirmed:true,confirmedOn:today,note:'Cliente confirmou pelo WhatsApp.'});
 if(confirm.action!=='confirmClient')throw Error('Invalid test fixture');
 assert.throws(()=>applyComplaintMutation(created,confirm,actor,now,today,'x'),/solução/);
 const resolved=applyComplaintMutation(created,{action:'followup',id,version:1,status:'resolved',message:'Timer substituído.',resolvedOn:'2026-10-19'},actor,now,today,'e2');
 assert.throws(()=>applyComplaintMutation(resolved,{...confirm,version:2,confirmedOn:'2026-10-18'},actor,now,today,'x'),/confirmação/);
 assert.throws(()=>applyComplaintMutation(resolved,{...confirm,version:2,confirmedOn:'2026-10-21'},actor,now,today,'x'),/confirmação/);
 assert.equal(complaintMutation.safeParse({...confirm,note:''}).success,false);
 const confirmed=applyComplaintMutation(resolved,{...confirm,version:2},actor,now,today,'e3');
 assert.equal(confirmed.clientConfirmation?.recordedBy,'Letícia');assert.equal(confirmed.events.at(-1)?.action,'client_confirmed');
 const alerts=buildHomeAlerts({complaints:[resolved]},today);assert.equal(alerts.find(g=>g.key==='complaint-confirmation')?.count,1);
 assert.equal(buildHomeAlerts({complaints:[confirmed]},today).find(g=>g.key==='complaint-confirmation')?.count,0);
 const reopened=applyComplaintMutation(confirmed,{action:'followup',id,version:3,status:'open',message:'Cliente relatou nova falha.',resolvedOn:''},actor,now,today,'e4');
 assert.equal(reopened.clientConfirmation,undefined);assert.equal(reopened.events.some(e=>e.action==='client_confirmed'),true);
});
test('entregas validam calendário, quantidade e reposição; devolvidos não geram alerta',()=>{
 const input={id:'11111111-1111-4111-8111-111111111111',staffId:'staff-esdras',version:0,category:'uniform',item:'Camisa',size:'G',quantity:2,deliveredOn:'2026-10-19',replacementOn:'2026-11-01',receivedConfirmed:false,notes:''};
 assert.equal(staffDeliverySchema.safeParse(input).success,true);
 for(const patch of [{quantity:0},{quantity:1.5},{deliveredOn:'2026-02-30'},{replacementOn:'2026-10-01'}])assert.equal(staffDeliverySchema.safeParse({...input,...patch}).success,false);
 const item={...input,staffName:'Esdras',returnedOn:'',createdBy:'Letícia',createdAt:'',updatedBy:'Letícia',updatedAt:''} as StaffDelivery;
 assert.equal(deliveryState(item,'2026-11-01'),'Reposição a conferir');assert.equal(deliveryState({...item,returnedOn:'2026-10-20'},'2026-11-01'),'Devolvido');
 assert.equal(buildHomeAlerts({staffDeliveries:[{...item,view:'technicians'}]},'2026-11-01').find(g=>g.key==='staff-replacement-technicians')?.count,1);
 assert.equal(buildHomeAlerts({staffDeliveries:[{...item,returnedOn:'2026-10-20',view:'technicians'}]},'2026-11-01').find(g=>g.key==='staff-replacement-technicians')?.count,0);
});
