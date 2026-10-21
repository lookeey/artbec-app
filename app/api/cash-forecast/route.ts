import {z} from 'zod';
import {authorize,canAccess} from '@/lib/auth';
import {getRecords,database} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {getManagement} from '@/lib/management-store';
import {buildCashForecast} from '@/lib/cash-forecast';

const query=z.object({from:z.string().date(),to:z.string().date()});
export async function GET(request:Request){
 const auth=await authorize(request,['cash-flow','receivables']);if(auth.error)return auth.error;
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success||parsed.data.from>parsed.data.to||Date.parse(parsed.data.to)-Date.parse(parsed.data.from)>366*86400000)return Response.json({error:'Escolha um período de até um ano.'},{status:400});
 try{const [records,operations,management]=await Promise.all([getRecords(),getOperations(),getManagement()]);const loanRows=await database().prepare("SELECT data FROM operation_changes WHERE entity='payrollLoan' AND deleted=0").all<{data:string}>();const manualRows=await database().prepare("SELECT data,version FROM operation_changes WHERE entity='cashManual' AND deleted=0 AND json_extract(data,'$.date') BETWEEN ? AND ?").bind(parsed.data.from,parsed.data.to).all<{data:string;version:number}>();const input={manual:manualRows.results.map(row=>({...JSON.parse(row.data),version:row.version})),payrollLoans:loanRows.results.map(row=>JSON.parse(row.data)),services:records.filter(r=>r.kind==='Serviço'),monthly:records.filter(row=>row.kind==='Mensalidade'),sales:operations.sales,academyInvoices:operations.academyInvoices,fuel:operations.fuel,oil:operations.oil,maintenance:operations.maintenance,payroll:operations.payroll,fines:management.fines};const forecast=buildCashForecast(input as Parameters<typeof buildCashForecast>[0],parsed.data.from,parsed.data.to),fullAccess=canAccess(auth.user!,'cash-flow');return Response.json({...forecast,rows:fullAccess?forecast.rows:forecast.rows.filter(row=>row.direction==='in'),totals:fullAccess?forecast.totals:{...forecast.totals,outConfirmed:0,outExpected:0,balance:forecast.totals.inConfirmed+forecast.totals.inExpected},missingPayroll:fullAccess?forecast.missingPayroll:[],canViewOutflow:fullAccess},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Cash forecast failed',error);return Response.json({error:'Não foi possível calcular o fluxo de caixa.'},{status:503})}
}
