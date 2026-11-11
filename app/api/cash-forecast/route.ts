import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {getRecords} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {buildCashForecast} from '@/lib/cash-forecast';

const query=z.object({from:z.string().date(),to:z.string().date()});
export async function GET(request:Request){
 const auth=await authorize(request,['cash-flow','receivables']);if(auth.error)return auth.error;
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success||parsed.data.from>parsed.data.to||Date.parse(parsed.data.to)-Date.parse(parsed.data.from)>366*86400000)return Response.json({error:'Escolha um período de até um ano.'},{status:400});
 try{const [records,operations]=await Promise.all([getRecords(),getOperations()]);const input={monthly:records.filter(row=>row.kind==='Mensalidade'),sales:operations.sales,academyInvoices:[],fuel:[],oil:[],maintenance:[],payroll:[],fines:[]};const forecast=buildCashForecast(input as Parameters<typeof buildCashForecast>[0],parsed.data.from,parsed.data.to),rows=forecast.rows.filter(row=>row.direction==='in'&&['Mensalidade','Produto'].includes(row.category)),confirmed=rows.filter(row=>row.certainty==='confirmed').reduce((sum,row)=>sum+row.amount,0),expected=rows.filter(row=>row.certainty==='expected').reduce((sum,row)=>sum+row.amount,0);return Response.json({rows,totals:{inConfirmed:confirmed,inExpected:expected,outConfirmed:0,outExpected:0,balance:confirmed+expected},unresolved:forecast.unresolved,missingPayroll:[],assumptions:['Mensalidades e vendas de produtos aos clientes são incluídas automaticamente.','Pagamentos marcados como pagos não têm data real de liquidação; usamos o vencimento da mensalidade ou a entrega do produto como referência.'],canViewOutflow:false},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Cash forecast failed',error);return Response.json({error:'Não foi possível calcular o fluxo de caixa.'},{status:503})}
}
