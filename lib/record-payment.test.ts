import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmRecordSaved,savePaymentStatus,PaymentUpdateError} from './record-payment.ts';

const row={id:'import-1-1',version:2,status:'paid'};
const response=(value:unknown,status=200)=>Response.json(value,{status});

test('confirma um pagamento relendo o banco antes de informar sucesso',async()=>{
 const calls:string[]=[];
 const request=((url:string,init?:RequestInit)=>{calls.push(init?.method??'GET');return Promise.resolve(init?.method==='PATCH'?response({record:row}):response({records:[row]}))}) as typeof fetch;
 assert.deepEqual(await savePaymentStatus({...row,version:1,status:'pending'},'paid',request),row);
 assert.deepEqual(calls,['PATCH','GET']);
});

test('avisa se a alteração não aparece na leitura seguinte',async()=>{
 const request=((_:string,init?:RequestInit)=>Promise.resolve(init?.method==='PATCH'?response({record:row}):response({records:[{...row,version:1,status:'pending'}]}))) as typeof fetch;
 await assert.rejects(confirmRecordSaved(row,request),/não apareceu no banco/);
 await assert.rejects(savePaymentStatus({...row,version:1,status:'pending'},'paid',request),PaymentUpdateError);
});

test('aceita vencido como leitura de um lançamento salvo em aberto',async()=>{
 const request=((url:string)=>Promise.resolve(response({records:[{...row,status:'overdue'}]}))) as typeof fetch;
 assert.equal((await confirmRecordSaved({...row,status:'pending'},request)).status,'overdue');
});
