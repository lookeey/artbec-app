import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {renderQuotePdf} from '../lib/quote-pdf.ts';
import {renderTabularReportPdf} from '../lib/tabular-report-pdf.ts';
import {artbecLogoBase64} from '../lib/artbec-logo.ts';
import type {Quote} from '../lib/quotes.ts';

test('orçamento com imagem e condições não cria página vazia para a assinatura visual',async()=>{
 const key='quote-images/test/photo.png',quote:Quote={id:'quote-test',version:1,clientId:'client-a',clientName:'Daniel',clientAddress:'Endereço a confirmar',title:'Troca de Areia (Incluso areia para piscina)',issuedAt:'2026-10-02',validUntil:'2026-10-17',status:'draft',items:[{id:'item-a',description:'Areia para piscina',quantity:1,unitCents:0,productId:'',imageKey:key}],notes:'',terms:'Pagamento via PIX',taskId:'',approvedAt:''};
 const bytes=await renderQuotePdf(quote,new Map([[key,Uint8Array.from(atob(artbecLogoBase64),c=>c.charCodeAt(0))]]));assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');const document=await PDFDocument.load(bytes);assert.equal(document.getPageCount(),1);assert.deepEqual(document.getPage(0).getSize(),{width:595,height:842});
});

test('exportação de tabela suporta descrição maior que uma página e várias colunas',async()=>{
 const bytes=await renderTabularReportPdf({title:'Relatório de conferência',columns:[{label:'Cliente'},{label:'Descrição',weight:3},{label:'Valor',right:true}],rows:[['Cliente A','Descrição longa '.repeat(1500),'R$ 1.234,56'],...Array.from({length:40},(_,i)=>['Cliente '+i,'Entrega de produtos','R$ 350,00'])]});const document=await PDFDocument.load(bytes);assert.ok(document.getPageCount()>3);for(const page of document.getPages())assert.deepEqual(page.getSize(),{width:842,height:595});
});
