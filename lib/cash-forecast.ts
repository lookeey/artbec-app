import type {ManualCash} from './manual-cash.ts';
import {buildReceivables,type MonthlyReceivable,type ProductReceivable} from './receivables.ts';
import {calculateFineDeductions,type FineForPayroll} from './fine-payroll.ts';
import {nextPeriod} from './month-rollover.ts';
import {loanDeductions,type PayrollLoan} from './payroll-loans.ts';

export type CashRow={id:string;date:string;direction:'in'|'out';certainty:'confirmed'|'expected';category:string;label:string;amount:number;note:string;payment?:string;manualId?:string;version?:number};
type PaidBill=MonthlyReceivable;
type PaidSale=ProductReceivable;
type Invoice={id:string;dueDate:string;amount:number|null;status:string;label:string};
type Expense={id:string;date:string;amount:number|null;technician?:string;driver?:string};
type Payroll={thirteenthDeductionsEnabled?:boolean;thirteenthFirstDeduction?:number;thirteenthSecondDeduction?:number;thirteenthFirst?:number;thirteenthSecond?:number;id:string;period:string;employee:string;baseSalary:number;hazardPay:number;overtime:number;bonus:number;inss:number;absences:number;advance:number;advance15:number;loan:number;fines:number};
type Service={id:string;client:string;date:string;amount:number|null;payment:string;status:string;description?:string};
type Input={services?:Service[];manual?:ManualCash[];payrollLoans?:PayrollLoan[];monthly:PaidBill[];sales:PaidSale[];academyInvoices:Invoice[];fuel:Expense[];oil:Expense[];maintenance:Expense[];payroll:Payroll[];fines:FineForPayroll[]};
const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const endDay=(period:string,day:number)=>`${period}-${String(Math.min(day,new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).getUTCDate())).padStart(2,'0')}`;

export function buildCashForecast(input:Input,from:string,to:string){
 const rows:CashRow[]=[];
 if(!isDate(from)||!isDate(to)||from>to)return {rows,totals:{inConfirmed:0,inExpected:0,outConfirmed:0,outExpected:0,balance:0},unresolved:0,missingPayroll:[],assumptions:['Período inválido.']};
 const add=(row:CashRow)=>{if(row.date>=from&&row.date<=to&&row.amount>0&&isDate(row.date))rows.push(row)};
 const receivables=buildReceivables(input.monthly,input.sales,from,to);
 for(const item of receivables.rows)add({id:`open-${item.id}`,date:item.dueDate,direction:'in',certainty:'expected',category:item.kind==='monthly'?'Mensalidade':'Produto',label:item.client,amount:item.amount,payment:item.payment,note:item.projected?'Projeção sem lançamento confirmado':item.description});
 for(const item of input.monthly.filter(row=>row.kind==='Mensalidade'&&row.status==='paid'))add({id:`paid-${item.id}`,date:item.date,direction:'in',certainty:'confirmed',category:'Mensalidade',label:item.client,amount:item.amount??0,payment:item.payment,note:'Pago · data de vencimento usada como referência'});
 for(const item of input.sales.filter(row=>row.channel==='Clientes'&&row.status==='paid'))add({id:`paid-${item.id}`,date:item.deliveredAt||item.deliveryDate||item.date,direction:'in',certainty:'confirmed',category:'Produto',label:item.client,amount:item.total??0,payment:item.payment||input.monthly.find(row=>row.client===item.client)?.payment||'',note:'Pago · data da entrega usada como referência'});
 for(const item of input.services??[])add({id:'service-'+item.id,date:item.date,direction:'in',certainty:item.status==='paid'?'confirmed':'expected',category:'Serviço',label:item.client,amount:item.amount??0,payment:item.payment,note:(item.description?item.description+' · ':'')+'Data da aprovação usada como referência; confira o vencimento e a liquidação.'});
 for(const loan of input.payrollLoans??[])if(loan.status==='active')add({id:'loan-issued-'+loan.id,date:loan.issuedDate,direction:'out',certainty:'confirmed',category:'Empréstimo à equipe',label:loan.employee,amount:loan.amount,note:'Empréstimo registrado. As parcelas reduzem o pagamento da folha, sem criar outra entrada.'});
 for(const item of input.academyInvoices)add({id:`academy-${item.id}`,date:item.dueDate,direction:'in',certainty:item.status==='paid'?'confirmed':'expected',payment:'BOLETO',category:'Boleto Academia',label:item.label,amount:item.amount??0,note:item.status==='paid'?'Marcado como pago · vencimento usado como referência':'Vencimento previsto'});
 for(const [category,items] of [['Gasolina',input.fuel],['Óleo',input.oil],['Manutenção',input.maintenance]] as [string,Expense[]][])for(const item of items)add({id:`${category}-${item.id}`,date:item.date,direction:'out',certainty:'confirmed',category,label:item.technician||item.driver||category,amount:item.amount??0,note:'Lançamento registrado'});
 const fineDeductions=calculateFineDeductions(input.fines,input.payroll),automatic=(person:Payroll)=>fineDeductions.filter(item=>item.period===person.period&&item.employee===person.employee).reduce((sum,item)=>sum+item.amount,0);
 for(const person of input.payroll){
  const scheduled=loanDeductions(input.payrollLoans??[],person.employee,person.period);
  const earned=person.baseSalary+person.hazardPay+person.overtime+person.bonus-person.absences;
  const remaining=Math.max(0,earned-person.inss-person.loan-person.fines-automatic(person)-scheduled.salary-person.advance-person.advance15);
  add({id:`payroll-15-${person.id}`,date:endDay(person.period,15),direction:'out',certainty:'expected',category:'Folha · dia 15',label:person.employee,amount:Math.max(0,person.advance15-scheduled.advance15),note:'Adiantamento previsto na folha'});
  add({id:`payroll-30-${person.id}`,date:endDay(person.period,30),direction:'out',certainty:'expected',category:'Folha · fechamento',label:person.employee,amount:remaining,note:'Saldo previsto após descontos e adiantamentos'});
  for(const payment of ['thirteenthFirst','thirteenthSecond'] as const){const gross=person[payment]??0;if(gross)add({id:`payroll-${payment}-${person.id}`,date:endDay(person.period,31),direction:'out',certainty:'expected',category:payment==='thirteenthFirst'?'Folha · 13º primeira parcela':'Folha · 13º segunda parcela',label:person.employee,amount:Math.max(0,gross-scheduled[payment]-(person.thirteenthDeductionsEnabled?(payment==='thirteenthFirst'?person.thirteenthFirstDeduction??0:person.thirteenthSecondDeduction??0):0)),note:'Valor informado na folha após empréstimos programados. Último dia do mês usado como referência; confira a data real do pagamento.'})}
 }
 for(const item of input.manual??[])add({id:item.id,manualId:item.id,version:item.version,date:item.date,direction:item.direction,certainty:item.certainty,category:item.category,label:item.label,amount:item.amount,payment:item.payment,note:item.note||'Lançamento manual'});
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category,'pt-BR')||a.label.localeCompare(b.label,'pt-BR'));
 const total=(direction:'in'|'out',certainty?:CashRow['certainty'])=>rows.filter(row=>row.direction===direction&&(!certainty||row.certainty===certainty)).reduce((sum,row)=>sum+row.amount,0);
 const missingPayroll:string[]=[];for(let period=from.slice(0,7);period<=to.slice(0,7)&&missingPayroll.length<13;period=nextPeriod(period))if(!input.payroll.some(item=>item.period===period))missingPayroll.push(period);
 return {rows,totals:{inConfirmed:total('in','confirmed'),inExpected:total('in','expected'),outConfirmed:total('out','confirmed'),outExpected:total('out','expected'),balance:total('in')-total('out')},unresolved:receivables.unresolved.length,missingPayroll,assumptions:['Pagamentos marcados como pagos não têm data real de liquidação; usamos o vencimento ou a entrega como referência.','Boletos da Academia são tratados como valores a receber, conforme a aba de vendas da Academia.','Folha usa o adiantamento do dia 15 e o saldo do dia 30. Outros adiantamentos sem data reduzem o saldo, mas não aparecem em um dia específico.','Serviços usam a data de aprovação como referência; o cadastro ainda não informa vencimento ou liquidação real. Empréstimos ativos entram como saída na data em que foram concedidos.','Não inclui despesas sem data ou valores não cadastrados.']};
}
