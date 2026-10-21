import {z} from 'zod';
import {authorize} from '@/lib/auth';
import {AuvoClient} from '@/lib/auvo/client';
import {getStoredCredentials} from '@/lib/auvo/store';
import {travelRead,travelSave,travelVisits} from '@/lib/auvo/travel-store';
import {travelMetrics,timestamp,type GpsPoint,type TravelResult} from '@/lib/auvo/travel-metrics';
import {database} from '@/lib/finance-store';
import type {AuvoListEnvelope} from '@/lib/auvo/types';
const date=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine(v=>new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v),userId=z.coerce.number().int().positive();
type Saved=TravelResult&{points:GpsPoint[]};
type Job={userId:number;date:string;actor:string;expires:number;page:number;complete:boolean;points:GpsPoint[];signature:string};
const idFor=(id:number,day:string)=>`auvo-travel-${id}-${day}`;
const publicResult=({points:_,...result}:Saved)=>result;
export async function GET(request:Request){
 const auth=await authorize(request,['profitability','performance']);if(auth.error)return auth.error;
 try{
  const parsed=z.object({userId,period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)return Response.json({error:'Selecione o técnico e o mês.'},{status:400});
  const {userId:id,period}=parsed.data;
  const days=(await database().prepare('SELECT DISTINCT substr(task_date,1,10) as date FROM auvo_tasks WHERE auvo_user_id=? AND substr(task_date,1,7)=? ORDER BY date DESC').bind(id,period).all<{date:string}>()).results.map(row=>row.date);
  const rows=(await database().prepare("SELECT data FROM operation_changes WHERE entity='auvoTravelDay' AND deleted=0 AND json_extract(data,'$.userId')=? AND substr(json_extract(data,'$.date'),1,7)=?").bind(id,period).all<{data:string}>()).results.map(row=>JSON.parse(row.data) as Saved);
  const results=await Promise.all(rows.map(async row=>({...publicResult(row),stale:JSON.stringify(await travelVisits(id,row.date))!==row.signature})));
  return Response.json({days,results},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível carregar os deslocamentos.'},{status:503})}
}
export async function POST(request:Request){
 const auth=await authorize(request,['profitability','performance']);if(auth.error)return auth.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
 try{
  const parsed=z.discriminatedUnion('action',[
   z.object({action:z.literal('start'),userId,date}),
   z.object({action:z.literal('page'),job:z.string().uuid()}),
   z.object({action:z.literal('times'),userId,date,visits:z.array(z.object({id:z.number().int().positive(),arrivalDate:z.string().nullable(),departureDate:z.string().nullable()})).max(200)}),
  ]).safeParse(await request.json());
  if(!parsed.success)return Response.json({error:'Confira o técnico e o dia.'},{status:400});
  const input=parsed.data;
  if(input.action==='times'){
   const visits=await travelVisits(input.userId,input.date);
   if(input.visits.some(v=>!visits.some(t=>t.id===v.id)||[v.arrivalDate,v.departureDate].some(t=>t!==null&&(!Number.isFinite(timestamp(t))||t.slice(0,10)!==input.date))||(v.arrivalDate&&v.departureDate&&timestamp(v.departureDate)<=timestamp(v.arrivalDate))))return Response.json({error:'Use horários reais desse dia, com saída após a chegada.'},{status:400});
   const id=`auvo-travel-times-${input.userId}-${input.date}`,old=await travelRead(id,'auvoTravelTimes');
   await travelSave(id,'auvoTravelTimes',{visits:input.visits},old?.version??0);
   const cache=await travelRead<Saved>(idFor(input.userId,input.date),'auvoTravelDay');
   if(cache){const current=await travelVisits(input.userId,input.date),saved={...cache.data,updatedAt:new Date().toISOString(),signature:JSON.stringify(current),metrics:travelMetrics(current,cache.data.points)};await travelSave(idFor(input.userId,input.date),'auvoTravelDay',saved,cache.version);return Response.json({result:publicResult(saved)})}
   return Response.json({saved:true});
  }
  if(input.action==='start'){
   const visits=await travelVisits(input.userId,input.date);
   if(!visits.length)return Response.json({error:'Não há agenda sincronizada para esse técnico e dia.'},{status:400});
   const job=crypto.randomUUID();
   await travelSave(job,'auvoTravelJob',{userId:input.userId,date:input.date,actor:auth.user!.id,expires:Date.now()+15*60000,page:1,complete:false,points:[],signature:JSON.stringify(visits)} satisfies Job,0);
   return Response.json({job});
  }
  const stored=await travelRead<Job>(input.job,'auvoTravelJob');
  if(!stored||stored.data.actor!==auth.user!.id||stored.data.expires<Date.now())return Response.json({error:'Consulta expirada. Inicie novamente.'},{status:409});
  const job=stored.data;
  if(job.complete){const saved=await travelRead<Saved>(idFor(job.userId,job.date),'auvoTravelDay');return Response.json({complete:true,result:saved?publicResult(saved.data):null})}
  if(job.page>20)throw new Error('O Auvo retornou muitos pontos neste dia. Os dados anteriores foram preservados.');
  const client=new AuvoClient(await getStoredCredentials()),query=new URLSearchParams({paramFilter:JSON.stringify({userId:job.userId,date:job.date,getLastKnowPosition:false}),page:String(job.page),pageSize:'100',order:'asc'});
  const response=await client.request<AuvoListEnvelope<GpsPoint>>('/gps?'+query),list=response.result?.entityList;
  if(!Array.isArray(list))throw new Error('O Auvo não retornou posições GPS nesse formato.');
  const valid=list.filter(p=>p.userId===job.userId&&typeof p.positionDate==='string'&&p.positionDate.slice(0,10)===job.date&&typeof p.latitude==='number'&&typeof p.longitude==='number').map(p=>({userId:p.userId,positionDate:p.positionDate,latitude:p.latitude,longitude:p.longitude,accuracy:p.accuracy}));
  if(list.length&&!valid.length)throw new Error('O Auvo retornou posições de outro técnico ou dia; os dados anteriores foram preservados.');
  const keys=new Set(job.points.map(p=>`${p.positionDate}|${p.latitude}|${p.longitude}`)),fresh=valid.filter(p=>!keys.has(`${p.positionDate}|${p.latitude}|${p.longitude}`));
  if(list.length&&job.page>1&&!fresh.length)throw new Error('O Auvo repetiu a página GPS. Os dados anteriores foram preservados.');
  const points=[...job.points,...fresh],known=response.result?.pagedSearchReturnData?.totalItems,size=response.result?.pagedSearchReturnData?.pageSize??100,complete=list.length===0||(typeof known==='number'&&known>=0?points.length>=known:list.length<Math.max(1,size));
  if(!complete){await travelSave(input.job,'auvoTravelJob',{...job,points,page:job.page+1},stored.version);return Response.json({complete:false,points:points.length,page:job.page})}
  if(points.length<2)throw new Error('O Auvo não retornou pontos GPS suficientes. Confira o monitoramento desse técnico; a última consulta salva foi mantida.');
  const visits=await travelVisits(job.userId,job.date);
  if(JSON.stringify(visits)!==job.signature)throw new Error('A agenda mudou durante a consulta. Inicie novamente.');
  const metrics=travelMetrics(visits,points);
  if(metrics.daily.km===null)throw new Error('O Auvo retornou GPS sem trechos válidos. A última consulta salva foi mantida.');
  const saved={userId:job.userId,date:job.date,updatedAt:new Date().toISOString(),signature:job.signature,metrics,points} satisfies Saved,old=await travelRead<Saved>(idFor(job.userId,job.date),'auvoTravelDay');
  await travelSave(idFor(job.userId,job.date),'auvoTravelDay',saved,old?.version??0);
  await travelSave(input.job,'auvoTravelJob',{...job,points:[],complete:true},stored.version);
  return Response.json({complete:true,result:publicResult(saved)});
 }catch(error){const message=error instanceof Error?error.message:'Falha na consulta GPS';return Response.json({error:message.includes('Os dados')||message.includes('O Auvo')||message.includes('consulta')||message.includes('agenda')?message:'Não foi possível consultar o GPS do Auvo. Verifique a conexão e a permissão GPS.'},{status:502})}
}
