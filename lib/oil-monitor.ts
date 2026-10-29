import {z} from 'zod';
const km=z.number().int().min(0).max(9999999);
export const oilMonitorId=z.string().regex(/^oilMonitor-[0-9a-f-]{36}$/i);
export const monitorSetup=z.object({id:oilMonitorId,version:z.number().int().min(0),technician:z.string().trim().min(1).max(200),plate:z.string().trim().min(1).max(30).transform(s=>s.toUpperCase()),currentKm:km,readingDate:z.string().date(),oilKm:km,oilDate:z.string().date(),serviceKm:km.nullable(),serviceDate:z.string().date().or(z.literal(''))}).superRefine((m,ctx)=>{if(m.currentKm<m.oilKm||(m.serviceKm!==null&&m.currentKm<m.serviceKm))ctx.addIssue({code:'custom',message:'O km atual não pode ser menor que o km da última manutenção.'});if(m.oilDate>m.readingDate||m.serviceDate>m.readingDate)ctx.addIssue({code:'custom',message:'A manutenção não pode estar depois da leitura atual.'});if(m.serviceKm!==null&&!m.serviceDate)ctx.addIssue({code:'custom',message:'Informe a data da última revisão.'})});
export type OilReading={date:string;km:number;event:'setup'|'reading'|'oil'|'service';at:string;amount?:number;expenseId?:string};
export type OilChangeRequest={id:string;date:string;at:string;requestedBy:string;technician:string;plate:string;completedDate?:string};
export type OilMonitor=z.infer<typeof monitorSetup>&{history:OilReading[];importReference?:{source:string;oilRow:number;oilReadingDate:string;currentReadingDate:string;approximate:boolean;oilKm:number;oilDate:string;currentKm:number;readingDate:string};lastOilExpenseId?:string;lastLedgerWrite?:string;oilRequests?:OilChangeRequest[]};
export function requestOilChange(previous:OilMonitor,date:string,at:string,requestedBy:string,id:string):OilMonitor{return {...previous,oilRequests:[...(previous.oilRequests??[]),{id,date,at,requestedBy,technician:previous.technician,plate:previous.plate}]}}

export function oilExpense(m:OilMonitor,amount:number,id:string){return {id,version:1,date:m.readingDate,technician:m.technician,plate:m.plate,amount,odometer:m.currentKm,lastChange:m.oilDate,notes:'Troca registrada pelo controle de quilometragem.',source:'Controle de óleo no site',sourceRow:0}}
export type OilLedgerItem=ReturnType<typeof oilExpense> extends infer T?Omit<T,'amount'>&{amount:number|null;entryType?:'reading'|'oil'}:never;
export function oilLedgerEntry(m:OilMonitor,id:string,previous:OilLedgerItem|null,amount?:number):OilLedgerItem{
 const paid=amount!==undefined||previous?.amount!=null;
 return {...oilExpense(m,amount??previous?.amount??0,id),...previous,id,version:(previous?.version??0)+1,date:m.readingDate,technician:m.technician,plate:m.plate,odometer:m.currentKm,lastChange:m.oilDate,amount:amount??previous?.amount??null,entryType:paid?'oil':'reading',notes:amount!==undefined?'Troca registrada pelo controle de quilometragem.':previous?.notes||'Leitura semanal de KM. Sem despesa.'};
}
export function kmInput(value:string):number|null{const s=value.trim();if(!s)return null;const normalized=/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,''):s;if(!/^\d+$/.test(normalized))return NaN;const n=Number(normalized);return Number.isSafeInteger(n)?n:NaN}
export const formatKm=(n:number)=>n.toLocaleString('pt-BR');
export function kmStatus(current:number,baseline:number|null,interval:number){if(baseline===null)return {next:null,remaining:null,traveled:null,progress:0,state:'unknown' as const};const next=baseline+interval,remaining=next-current,traveled=current-baseline;return {next,remaining,traveled,progress:Math.min(100,Math.max(0,traveled/interval*100)),state:remaining<=0?'due' as const:remaining<=interval*.2?'soon' as const:'ok' as const}}
export function updateOilMonitor(previous:OilMonitor,mode:'reading'|'oil'|'service',km:number,date:string,at:string):OilMonitor{
 if(mode==='oil'){
  if(date<previous.oilDate||km<previous.oilKm)throw Error('A troca não pode ser anterior à última troca registrada.');
  if(date<previous.readingDate&&km>previous.currentKm)throw Error('O KM da troca não pode superar a leitura mais recente.');
  if(date>=previous.readingDate&&km<previous.currentKm)throw Error('O KM da troca não pode diminuir em relação à última leitura.');
 }else{
  if(km<previous.currentKm)throw Error('O km não pode diminuir. Use Ajustar referências para corrigir um lançamento.');
  if(date<previous.readingDate)throw Error('A data não pode ser anterior à última leitura.');
 }
 const earlier=mode==='oil'&&date<previous.readingDate;
 return {...previous,currentKm:earlier?previous.currentKm:km,readingDate:earlier?previous.readingDate:date,
 ...(mode==='oil'?{oilKm:km,oilDate:date,oilRequests:(previous.oilRequests??[]).map(request=>!request.completedDate&&request.date<=date?{...request,completedDate:date}:request)}:{}),
 ...(mode==='service'?{serviceKm:km,serviceDate:date}:{}),history:[...previous.history,{date,km,event:mode,at}].slice(-200)}
}
