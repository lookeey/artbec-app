import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderProfitabilityPdf} from '../lib/profitability-pdf.ts';
import {PDFDocument} from 'pdf-lib';

test('products do not change profitability, customer allocation, quality checks or PDF export',async()=>{
 await mkdir('tmp/pdfs',{recursive:true});const folder=await mkdtemp(resolve('tmp','profitability-'));
 const tasks=[{auvoId:1,auvoUserId:10,technician:'Kevin',customerId:100,customer:'Cliente A',taskDate:'2026-10-02',durationMinutes:60},
  {auvoId:2,auvoUserId:10,technician:'Kevin',customerId:100,customer:'Cliente A',taskDate:'2026-10-05',durationMinutes:60},
  {auvoId:3,auvoUserId:20,technician:'Esdras',customerId:100,customer:'Cliente A',taskDate:'2026-10-08',durationMinutes:60}];
 const payroll=employee=>({employee,period:'2026-10',baseSalary:10000,hazardPay:0,overtime:0,bonus:0,absences:0,inss:100,advance:500,advance15:1000,loan:100,fines:50});
 const operations={payroll:[payroll('Kevin'),payroll('Esdras')],fuel:[{technician:'Kevin',date:'2026-10-01',amount:1000}],oil:[{technician:'Esdras',date:'2026-10-01',amount:500}],maintenance:[],sales:[],prices:[],stock:[]};
 globalThis.__profitTest={operations,tasks,records:[{kind:'Mensalidade',period:'2026-10',client:'Cliente A',amount:90000}]};
 try{
  let source=(await readFile('lib/profitability.ts','utf8')).replace("import {database,getRecords} from '@/lib/finance-store';","const database=()=>({prepare:()=>({bind:()=>({all:async()=>({results:globalThis.__profitTest.tasks})})})}),getRecords=async()=>globalThis.__profitTest.records;")
   .replace("import {getOperations} from '@/lib/operations-store';",'const getOperations=async()=>globalThis.__profitTest.operations;')
   .replace("import {businessToday} from '@/lib/month-rollover';","const businessToday=()=> '2026-10-26';");
  await writeFile(resolve(folder,'report.ts'),'// @ts-nocheck\n'+source);
  const {getProfitability}=await import(pathToFileURL(resolve(folder,'report.ts')).href);
  const baseline=await getProfitability('2026-10');
  assert.equal(baseline.summary.revenue,90000);assert.equal(baseline.summary.directCost,21500);assert.equal(baseline.summary.profit,68500);
  const kevin=baseline.technicians.find(person=>person.name==='Kevin'),esdras=baseline.technicians.find(person=>person.name==='Esdras');
  assert.equal(kevin.revenue,60000);assert.equal(esdras.revenue,30000);
  assert.equal(kevin.customers[0].allocatedCost,11000);assert.equal(esdras.customers[0].allocatedCost,10500);
  assert.equal(kevin.remainingPay,8250);
  operations.sales=[{client:'Cliente A',channel:'Clientes',deliveryStatus:'delivered',deliveredAt:'2026-10-02',product:'Produto',quantity:3,total:9000000,stockItems:[{productId:'stock-a',quantity:3}]},{client:'Sem visitas',channel:'Clientes',deliveryStatus:'delivered',period:'2026-10',product:'Sem custo',total:800000}];
  operations.prices=[{product:'Produto',kind:'Custo',price:90000}];operations.stock=[{id:'stock-a',product:'Produto'}];
  assert.deepEqual(await getProfitability('2026-10'),baseline);
  assert.ok(!('productCost' in baseline.summary));assert.ok(!('missingProductCosts' in baseline.quality));
  const saved=await renderProfitabilityPdf(baseline,'all','',new Date('2026-10-26T12:00:00Z'));
  const pdf=await PDFDocument.load(saved);assert.ok(pdf.getPageCount()>=3);
  await writeFile('tmp/pdfs/rentabilidade-sem-produtos.pdf',saved);
  const selected=await renderProfitabilityPdf(baseline,'10');assert.ok((await PDFDocument.load(selected)).getPageCount()>=3);
 }finally{delete globalThis.__profitTest;await rm(folder,{recursive:true,force:true})}
});
