type PaymentRecord={id:string;version:number;status:string};
export async function confirmRecordSaved<T extends PaymentRecord>(saved:T,request:typeof fetch=fetch):Promise<T>{
 const response=await request('/api/records',{cache:'no-store'});
 if(!response.ok)throw new Error('A alteração foi enviada, mas não foi possível conferir se ficou salva.');
 const data=await response.json() as {records:T[]};
 const current=data.records.find(row=>row.id===saved.id);
 const sameStatus=current?.status===saved.status||saved.status==='pending'&&current?.status==='overdue';
 if(!current||current.version<saved.version||!sameStatus)throw new Error('A alteração não apareceu no banco após salvar. Confira o armazenamento do site.');
 return current;
}
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
   if(response.ok)return await confirmRecordSaved(data.record,request);
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
