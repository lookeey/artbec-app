type PaymentRecord={id:string;version:number;status:string};
export class PaymentUpdateError<T extends PaymentRecord> extends Error{
 record:T;
 constructor(message:string,record:T){super(message);this.record=record}
}

// Refresh only this row on a version conflict, then apply only the payment
// status to the latest record so concurrent edits to dates/amounts survive.
export async function savePaymentStatus<T extends PaymentRecord>(record:T,status:string,request:typeof fetch=fetch):Promise<T>{
 let current=record;
 try{
  for(let attempt=0;attempt<2;attempt++){
   const response=await request('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...current,status})});
   const data=await response.json() as {record:T;error?:string};
   if(response.ok)return data.record;
   if(response.status!==409)throw new Error(data.error||'Não foi possível mudar a situação.');
   const latest=await request('/api/records',{cache:'no-store'});
   if(!latest.ok)throw new Error('Não foi possível conferir o pagamento. Tente novamente.');
   const rows=await latest.json() as {records:T[]};
   const found=rows.records.find(row=>row.id===record.id);
   if(!found)throw new Error('Este lançamento não está mais disponível.');
   current=found;
   if(current.status===status)return current;
  }
  throw new Error('Este pagamento recebeu outra alteração. Tente marcar novamente.');
 }catch(error){throw new PaymentUpdateError(error instanceof Error?error.message:'Não foi possível mudar a situação.',current)}
}
