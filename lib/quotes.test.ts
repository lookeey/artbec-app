import assert from 'node:assert/strict';
import {test} from 'node:test';
import {quoteTotal,reservedProducts,type Quote} from './quotes.ts';

const quote=(status:Quote['status']):Quote=>({id:'quote-1',version:1,clientId:'c',clientName:'Cliente',clientAddress:'',title:'Reparo',issuedAt:'2026-10-02',validUntil:'2026-10-17',status,items:[{id:'i',description:'Bomba',productId:'stock-1',quantity:2,unitCents:12550}],notes:'',terms:'',taskId:'',approvedAt:''});
test('reserva apenas produtos de propostas aprovadas e soma centavos',()=>{assert.equal(quoteTotal(quote('approved').items),25100);assert.equal(reservedProducts([quote('sent'),quote('approved')]).get('stock-1'),2)});
