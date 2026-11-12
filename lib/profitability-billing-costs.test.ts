import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateBillingCosts} from './profitability-billing-costs.ts';
import type {BillingEntry} from './profitability-billing.ts';

const team=[{technicianId:'a',name:'Ana',aliases:['Ana'],payrollCost:10000,fuelCost:1000,oilCost:0,maintenanceCost:0},{technicianId:'b',name:'Beto',aliases:['Beto'],payrollCost:20000,fuelCost:2000,oilCost:0,maintenanceCost:0}];
const entry=(id:string,category:string,amount:number,technicianIds:string[]=[]):BillingEntry=>({id:`billing-2026-11-${id.padEnd(8,'0')}`,version:1,period:'2026-11',date:'2026-11-12',direction:'expense',category,description:'',client:'',clients:[],technicianIds,grossAmount:null,amount,status:'confirmed',taxType:'none',boletoFee:false});

test('reparte gasolina e folha conforme os gastos reais e outros custos igualmente',()=>{
 const {costs,covered}=allocateBillingCosts([entry('fuel','Gasolina',3000),entry('salary','Salário',9000),entry('food','iFood',600)],team,new Map());
 assert.equal(costs.get('a')?.fuelCost,1000);assert.equal(costs.get('b')?.fuelCost,2000);
 assert.equal(costs.get('a')?.payrollCost,3000);assert.equal(costs.get('b')?.payrollCost,6000);
 assert.equal(costs.get('a')?.otherCost,300);assert.equal(costs.get('b')?.otherCost,300);
 assert.deepEqual([...covered.get('fuelCost')!],['a','b']);
});

test('respeita técnico escolhido e inclui desconto de entrada como custo',()=>{
 const discounted={...entry('income','Mensalidade',8800),direction:'income' as const,grossAmount:10000,amount:8800,clients:['Cliente A']};
 const {costs}=allocateBillingCosts([entry('food','iFood',500,['b']),discounted],team,new Map([['cliente a',['a']]]));
 assert.equal(costs.get('a')?.otherCost,1200);assert.equal(costs.get('b')?.otherCost,500);
});

test('condução e Uber vão para Leandro; óleo fica com quem tem troca registrada',()=>{
 const people=[...team,{technicianId:'l',name:'Leandro',aliases:['Leandro'],payrollCost:10000,fuelCost:0,oilCost:0,maintenanceCost:0}];
 people[0].oilCost=1000;people[1].oilCost=2000;
 const {costs,items}=allocateBillingCosts([entry('uber','Uber',800),entry('ride','Condução',400),entry('oil','Óleo',3000),entry('repair','Manutenções',900),entry('life','Seguro de vida',600),entry('food','iFood',300)],people,new Map());
 assert.equal(costs.get('l')?.oilCost,0);assert.equal(costs.get('l')?.otherCost,1500);
 assert.equal(costs.get('a')?.oilCost,1000);assert.equal(costs.get('b')?.oilCost,2000);
 assert.equal(costs.get('l')?.maintenanceCost,300);
 assert.ok(items.get('l')?.some(item=>item.category==='Seguro de vida'));
});
