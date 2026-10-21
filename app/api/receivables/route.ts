import {authorize} from '@/lib/auth';
import {getRecords} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';

export async function GET(request:Request){
 const auth=await authorize(request,['receivables']);if(auth.error)return auth.error;
 try{const [records,operations]=await Promise.all([getRecords(),getOperations()]);
  return Response.json({monthly:records.filter(row=>row.kind==='Mensalidade').map(row=>({id:row.id,kind:row.kind,client:row.client,period:row.period,date:row.date,amount:row.amount,payment:row.payment,status:row.status})),sales:operations.sales.filter(row=>row.channel==='Clientes').map(row=>({id:row.id,channel:row.channel,client:row.client,product:row.product,period:row.period,date:row.date,deliveryDate:row.deliveryDate,deliveredAt:row.deliveredAt,deliveryStatus:row.deliveryStatus,total:row.total,status:row.status,payment:row.payment,billingClient:row.billingClient,billingDueDay:row.billingDueDay}))},{headers:{'Cache-Control':'no-store'}})
 }catch(error){console.error('Receivables read failed',error);return Response.json({error:'Não foi possível calcular os valores a receber.'},{status:503})}
}
