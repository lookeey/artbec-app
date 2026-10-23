import {billingKey} from './annual-adjustments.ts';

export type MonthlyCancellation={id:string;clientKey:string;client:string;period:string;recordId:string;at:string};
type BillingRecord={kind:string;client:string;period:string;date:string;status:string};

export async function monthlyCancellations(db:D1Database):Promise<MonthlyCancellation[]>{
 const rows=await db.prepare("SELECT data FROM operation_changes WHERE entity='monthlyCancellation' AND deleted=0").all<{data:string}>();
 return rows.results.map(row=>JSON.parse(row.data) as MonthlyCancellation);
}
export function monthlyCancelled(record:Pick<BillingRecord,'kind'|'client'|'period'>,rules:MonthlyCancellation[]){
 return record.kind==='Mensalidade'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(record.period)&&rules.some(rule=>rule.clientKey===billingKey(record.client)&&record.period>=rule.period);
}
export function monthlyPaymentStatus(record:Pick<BillingRecord,'kind'|'date'|'status'>,today:string){
 if(record.kind!=='Mensalidade'||!['pending','overdue'].includes(record.status)||!/^\d{4}-\d{2}-\d{2}$/.test(record.date))return record.status;
 return record.date<today?'overdue':'pending';
}
