import {authorize} from '@/lib/auth';
import {database} from '@/lib/finance-store';
import {getOperations} from '@/lib/operations-store';
import {stockHistory,type StockAudit} from '@/lib/stock-history';

export async function GET(request:Request){
 const auth=await authorize(request,['inventory']);if(auth.error)return auth.error;
 try{
  const [operations,audit]=await Promise.all([getOperations(),database().prepare("SELECT sequence,record_id,before_data,after_data,at FROM audit_events WHERE source_table='operation_changes' AND entity='stock' ORDER BY sequence").all<StockAudit>()]);
  const entries=stockHistory(operations.stock as Parameters<typeof stockHistory>[0],operations.stockMovements as Parameters<typeof stockHistory>[1],operations.sales as Parameters<typeof stockHistory>[2],audit.results);
  return Response.json({entries},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  console.error('Stock history read failed',error);
  return Response.json({error:'Não foi possível carregar as entradas e saídas do estoque.'},{status:503});
 }
}
