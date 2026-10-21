import test from 'node:test';
import assert from 'node:assert/strict';
import {kmInput,kmStatus,updateOilMonitor,monitorSetup,oilExpense,oilLedgerEntry,requestOilChange,type OilMonitor} from './oil-monitor.ts';
import {buildHomeAlerts} from './home-alerts.ts';
const baseline:OilMonitor={id:`oilMonitor-${crypto.randomUUID()}`,version:1,technician:'Técnico de teste',plate:'ABC1234',currentKm:44595,readingDate:'2026-04-14',oilKm:44595,oilDate:'2026-04-14',serviceKm:44595,serviceDate:'2026-04-14',history:[]};
test('leituras semanais acumulam 1000 km no mesmo controle e só a troca reinicia',()=>{
 let m=updateOilMonitor(baseline,'reading',44900,'2026-04-20','now');
 m=updateOilMonitor(m,'reading',45595,'2026-04-27','now');
 assert.equal(m.id,baseline.id);assert.equal(kmStatus(m.currentKm,m.oilKm,1000).traveled,1000);
 m=requestOilChange(m,'2026-04-27','now','Letícia','request');assert.equal(kmStatus(m.currentKm,m.oilKm,1000).state,'due');
 m=updateOilMonitor(m,'oil',45595,'2026-04-27','now');assert.equal(kmStatus(m.currentKm,m.oilKm,1000).next,46595);
 assert.equal(m.serviceKm,baseline.serviceKm);
});
test('leitura sem custo, correção e troca usam o mesmo lançamento diário sem duplicar valor',()=>{
 const m=updateOilMonitor(baseline,'reading',44900,'2026-04-20','now');
 const reading=oilLedgerEntry(m,'oil-daily',null);assert.equal(reading.amount,null);assert.equal(reading.entryType,'reading');
 const corrected=oilLedgerEntry({...m,currentKm:45000},reading.id,reading);assert.equal(corrected.id,reading.id);assert.equal(corrected.odometer,45000);assert.equal(corrected.version,2);
 const changed=updateOilMonitor({...m,currentKm:45000},'oil',45000,m.readingDate,'now');
 const paid=oilLedgerEntry(changed,reading.id,corrected,4200);assert.equal(paid.id,reading.id);assert.equal(paid.amount,4200);assert.equal(paid.entryType,'oil');assert.equal(paid.lastChange,m.readingDate);
 const again=oilLedgerEntry(changed,reading.id,paid);assert.equal(again.amount,4200);assert.equal(again.entryType,'oil');
});
test('interpreta KM inteiro com separador brasileiro e rejeita decimais',()=>{assert.equal(kmInput('44.595'),44595);assert.equal(kmInput('44595'),44595);assert.equal(kmInput(''),null);assert.ok(Number.isNaN(kmInput('44,595')));assert.ok(Number.isNaN(kmInput('44.59')))});
test('troca vence exatamente em 45.595 e revisão em 49.595',()=>{assert.equal(kmStatus(45594,44595,1000).state,'soon');assert.equal(kmStatus(45595,44595,1000).state,'due');assert.equal(kmStatus(49600,44595,5000).remaining,-5);assert.equal(kmStatus(49595,44595,5000).state,'due');assert.equal(kmStatus(44595,null,5000).state,'unknown')});
test('troca reinicia só óleo, mantém revisão e histórico',()=>{const m=updateOilMonitor(baseline,'oil',45595,'2026-05-14','2026-05-14T12:00:00Z');assert.equal(m.oilKm,45595);assert.equal(m.serviceKm,44595);assert.equal(kmStatus(m.currentKm,m.oilKm,1000).next,46595);assert.equal(kmStatus(m.currentKm,m.serviceKm,5000).next,49595);assert.equal(m.history[0].event,'oil');const review=updateOilMonitor(m,'service',49595,'2026-06-14','2026-06-14T12:00:00Z');assert.equal(review.oilKm,45595);assert.equal(review.serviceKm,49595)});
test('leitura não reinicia ciclos e rejeita regressão de km ou data',()=>{const m=updateOilMonitor(baseline,'reading',45595,'2026-04-15','now');assert.equal(m.oilKm,44595);assert.equal(m.serviceKm,44595);assert.throws(()=>updateOilMonitor(m,'reading',44000,'2026-04-16','now'));assert.throws(()=>updateOilMonitor(m,'reading',45600,'2026-04-13','now'));assert.equal(monitorSetup.safeParse({...baseline,currentKm:44000}).success,false)});
test('alerta do Início usa os limites e ignora revisão não configurada',()=>{const alerts=buildHomeAlerts({oilMonitors:[{...baseline,currentKm:45595,serviceKm:null}]},'2026-04-15');assert.equal(alerts[0].count,1);assert.equal(alerts[0].tone,'red');assert.match(alerts[0].items[0].detail,/45\.595/);assert.equal(alerts[1].count,0)});

test('troca gera despesa com valor, data, técnico e moto corretos',()=>{const updated=updateOilMonitor(baseline,'oil',45595,'2026-05-14','2026-05-14T12:00:00Z');const e=oilExpense(updated,3500,'oil-test');assert.equal(e.amount,3500);assert.equal(e.date,'2026-05-14');assert.equal(e.lastChange,'2026-05-14');assert.equal(e.odometer,45595);assert.equal(e.technician,baseline.technician);assert.equal(e.plate,baseline.plate);assert.equal(e.version,1)});

test('pedido preserva técnico, autor, data e ciclos; leituras e revisão não o encerram',()=>{const requested=requestOilChange(baseline,'2026-04-15','2026-04-15T12:00:00Z','Letícia','request-1');assert.equal(requested.oilKm,baseline.oilKm);assert.equal(requested.readingDate,baseline.readingDate);assert.equal(requested.oilRequests?.[0].requestedBy,'Letícia');assert.equal(requested.oilRequests?.[0].technician,baseline.technician);const read=updateOilMonitor(requested,'reading',45000,'2026-04-16','2026-04-16T12:00:00Z');const service=updateOilMonitor(read,'service',45000,'2026-04-16','2026-04-16T13:00:00Z');assert.equal(service.oilRequests?.[0].completedDate,undefined);assert.equal(requested.oilRequests?.[0].completedDate,undefined)});
test('troca atende pedidos anteriores e mantém histórico e pedidos posteriores abertos',()=>{let requested=requestOilChange(baseline,'2026-04-15','2026-04-15T12:00:00Z','Letícia','request-1');requested=requestOilChange(requested,'2026-04-18','2026-04-18T12:00:00Z','Muriel','request-2');const changed=updateOilMonitor(requested,'oil',45595,'2026-04-17','2026-04-19T12:00:00Z');assert.equal(changed.oilRequests?.[0].completedDate,'2026-04-17');assert.equal(changed.oilRequests?.[0].date,'2026-04-15');assert.equal(changed.oilRequests?.[1].completedDate,undefined);assert.equal(requested.oilRequests?.[0].completedDate,undefined);const again=updateOilMonitor(changed,'oil',46595,'2026-04-20','2026-04-20T12:00:00Z');assert.equal(again.oilRequests?.[0].completedDate,'2026-04-17');assert.equal(again.oilRequests?.[1].completedDate,'2026-04-20')});

test('troca informada depois preserva leitura mais recente e lança no mês da troca',()=>{
 const latest=updateOilMonitor(baseline,'reading',45900,'2026-05-04','now');
 const m=updateOilMonitor(latest,'oil',45595,'2026-04-30','now');
 assert.equal(m.currentKm,45900);assert.equal(m.readingDate,'2026-05-04');assert.equal(m.oilKm,45595);assert.equal(m.oilDate,'2026-04-30');
 const expense=oilLedgerEntry({...m,currentKm:m.oilKm,readingDate:m.oilDate},'oil-test',null,4200);
 assert.equal(expense.date,'2026-04-30');assert.equal(expense.odometer,45595);assert.equal(kmStatus(m.currentKm,m.oilKm,1000).remaining,695);
 assert.throws(()=>updateOilMonitor(latest,'oil',46000,'2026-04-30','now'));
 assert.throws(()=>updateOilMonitor(latest,'oil',45595,'2026-05-05','now'));
});
test('virada de mês e ano mantém moto, KM, última troca e revisão',()=>{
 const september={...baseline,currentKm:45000,readingDate:'2026-09-28'};
 const october=updateOilMonitor(september,'reading',45200,'2026-10-05','now');
 const november=updateOilMonitor(october,'reading',45300,'2026-11-02','now');
 const january=updateOilMonitor(november,'reading',45400,'2027-01-04','now');
 assert.equal(january.id,baseline.id);assert.equal(january.oilKm,baseline.oilKm);assert.equal(january.oilDate,baseline.oilDate);assert.equal(january.serviceKm,baseline.serviceKm);
 assert.equal(kmStatus(january.currentKm,january.oilKm,1000).remaining,195);assert.deepEqual(january.history.map(r=>r.date),['2026-10-05','2026-11-02','2027-01-04']);
});
