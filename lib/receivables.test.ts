import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReceivables,paymentGroup,type MonthlyReceivable,type ProductReceivable} from './receivables.ts';

const bills:MonthlyReceivable[]=[{id:'m1',kind:'Mensalidade',client:'Ana Lúcia',period:'2026-09',date:'2026-09-15',amount:30000,payment:'PIX',status:'paid'},{id:'m2',kind:'Mensalidade',client:'Bruno',period:'2026-09',date:'2026-09-30',amount:40000,payment:'BOLETO',status:'pending'}];
const sale=(id:string,deliveryDate:string):ProductReceivable=>({id,channel:'Clientes',client:'Ana Lúcia',product:'Cloro',period:'2026-09',date:deliveryDate,deliveryDate,deliveryStatus:'delivered',total:5000,status:'pending'});

test('produto entregue até o vencimento entra no mesmo mês; depois, no próximo',()=>{
 const result=buildReceivables(bills,[sale('before','2026-09-15'),sale('after','2026-09-16')],'2026-09-01','2026-10-31');
 assert.equal(result.rows.find(row=>row.id==='before')?.dueDate,'2026-09-15');
 assert.equal(result.rows.find(row=>row.id==='after')?.dueDate,'2026-10-15');
 assert.equal(result.rows.find(row=>row.id==='after')?.paymentGroup,'pix');
});

test('projeta mensalidade futura e respeita o último dia do mês',()=>{
 const result=buildReceivables(bills,[],'2026-10-01','2026-11-30');
 assert.equal(result.rows.find(row=>row.client==='Bruno'&&row.dueDate==='2026-11-30')?.amount,40000);
 assert.equal(result.rows.filter(row=>row.kind==='monthly').length,4);
});

test('não soma produtos sem data ou vencimento identificável',()=>{
 const item={...sale('unknown',''),client:'Cliente sem cadastro',date:'',deliveryDate:''};
 const result=buildReceivables(bills,[item],'2026-09-01','2026-09-30');
 assert.equal(result.rows.some(row=>row.id==='unknown'),false);
 assert.equal(result.unresolved[0]?.id,'unknown');
 assert.equal(paymentGroup('Transferência bancária'),'transfer');
});

test('vencimento no dia 31 se ajusta ao fim de fevereiro',()=>{
 const monthly=[{...bills[0],date:'2026-01-31',period:'2026-01'}];
 const item={...sale('late','2026-02-01'),period:'2026-02'};
 const result=buildReceivables(monthly,[item],'2026-02-01','2026-02-28');
 assert.equal(result.rows.find(row=>row.id==='late')?.dueDate,'2026-02-28');
});
