import type {ComplaintPhoto} from './complaint-photos';
import {z} from 'zod';
export const COMPLAINT_CATEGORIES=['Limpeza','Qualidade da água','Bomba / equipamento','Timer','Atraso / falta de visita','Produtos','Cobrança','Atendimento','Outros'] as const;
export const COMPLAINT_STATUSES={open:'Em aberto',in_progress:'Em atendimento',waiting:'Aguardando retorno',resolved:'Resolvida pela equipe'} as const;
export const COMPLAINT_PRIORITIES={normal:'Normal',high:'Alta',urgent:'Urgente'} as const;
export type ComplaintStatus=keyof typeof COMPLAINT_STATUSES;
export type ComplaintFields={clientId:string;clientName:string;title:string;description:string;occurredOn:string;category:string;priority:keyof typeof COMPLAINT_PRIORITIES;owner:string;dueOn:string};
export type ComplaintEvent={id:string;at:string;by:string;byId:string;action:'created'|'edited'|'followup'|'resolved'|'reopened'|'archived'|'restored'|'photo_added'|'client_confirmed'|'client_confirmation_pending';photo?:ComplaintPhoto;detail:string;status:ComplaintStatus;resolvedOn?:string};
export type Complaint=ComplaintFields&{clientConfirmation?:{confirmedOn:string;note:string;recordedBy:string;recordedAt:string};photos?:ComplaintPhoto[];id:string;version:number;status:ComplaintStatus;resolution:string;resolvedOn:string;archived:boolean;createdAt:string;createdBy:string;updatedAt:string;events:ComplaintEvent[]};
export const validComplaintDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const day=z.string().refine(validComplaintDate),optionalDay=z.union([z.literal(''),day]);
const id=z.string().regex(/^complaint-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const version=z.number().int().min(0);
const fields=z.object({clientId:z.string().max(200),clientName:z.string().trim().min(1).max(200),title:z.string().trim().min(1).max(180),description:z.string().trim().min(1).max(6000),occurredOn:day,category:z.string().trim().min(1).max(80).transform(value=>value.replace(/\s+/g,' ')),priority:z.enum(['normal','high','urgent']),owner:z.string().trim().max(160),dueOn:optionalDay}).strict();
export const complaintMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),id,version,fields}).strict(),
 z.object({action:z.literal('followup'),id,version,status:z.enum(['open','in_progress','waiting','resolved']),message:z.string().trim().min(1).max(6000),resolvedOn:optionalDay.default('')}).strict(),
 z.object({action:z.literal('confirmClient'),id,version,confirmed:z.boolean(),confirmedOn:optionalDay,note:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('archive'),id,version,archived:z.boolean()}).strict()
]);
export type ComplaintMutation=z.infer<typeof complaintMutation>;
export function applyComplaintMutation(previous:Complaint|null,input:ComplaintMutation,actor:{id:string;name:string},now:string,today:string,eventId:string):Complaint{
 if(!previous&&input.action!=='save')throw new Error('Reclamação não encontrada.');
 if(previous?.archived&&input.action!=='archive')throw new Error('Restaure esta reclamação antes de alterá-la.');
 let item:Complaint;
 let action:ComplaintEvent['action'],detail:string,resolvedOn:string|undefined;
 if(input.action==='save'){
  if(input.fields.occurredOn>today)throw new Error('A data da reclamação não pode estar no futuro.');
  if(previous?.status==='resolved'&&input.fields.occurredOn>previous.resolvedOn)throw new Error('A reclamação deve ser anterior ou igual à resolução.');
  item={...input.fields,...(previous?.clientConfirmation?{clientConfirmation:previous.clientConfirmation}:{}),photos:previous?.photos??[],id:input.id,version:input.version+1,status:previous?.status??'open',resolution:previous?.resolution??'',resolvedOn:previous?.resolvedOn??'',archived:previous?.archived??false,createdAt:previous?.createdAt??now,createdBy:previous?.createdBy??actor.name,updatedAt:now,events:previous?.events??[]};
  action=previous?'edited':'created';
  const labels:Record<keyof ComplaintFields,string>={clientId:'vínculo do cliente',clientName:'cliente',title:'assunto',description:'relato',occurredOn:'data',category:'motivo',priority:'prioridade',owner:'responsável',dueOn:'prazo'};
  detail=previous?'Dados atualizados: '+(Object.keys(labels) as (keyof ComplaintFields)[]).filter(k=>previous[k]!==item[k]).map(k=>labels[k]+': '+(previous[k]||'não informado')+' -> '+(item[k]||'não informado')).join('; '):input.fields.description;
  if(previous&&detail==='Dados atualizados: ')return previous;
 }else if(input.action==='followup'){
  const p=previous!;resolvedOn=input.status==='resolved'?(input.resolvedOn||today):undefined;
  if(resolvedOn&&(!validComplaintDate(resolvedOn)||resolvedOn<p.occurredOn||resolvedOn>today))throw new Error('Confira a data da resolução: entre a reclamação e hoje.');
  action=input.status==='resolved'?'resolved':p.status==='resolved'?'reopened':'followup';detail=input.message;
  item={...p,clientConfirmation:undefined,version:p.version+1,status:input.status,resolution:input.status==='resolved'?input.message:'',resolvedOn:resolvedOn??'',updatedAt:now};
 }else if(input.action==='confirmClient'){
  const p=previous!;if(p.status!=='resolved')throw Error('Registre a solução da equipe antes do retorno do cliente.');
  if(input.confirmed&&(!validComplaintDate(input.confirmedOn)||input.confirmedOn<p.resolvedOn||input.confirmedOn>today))throw Error('A confirmação deve ser entre a solução da equipe e hoje.');
  item={...p,version:p.version+1,updatedAt:now,clientConfirmation:input.confirmed?{confirmedOn:input.confirmedOn,note:input.note,recordedBy:actor.name,recordedAt:now}:undefined};action=input.confirmed?'client_confirmed':'client_confirmation_pending';detail=input.note;
 }else{
  const p=previous!;if(p.archived===input.archived)return p;
  item={...p,version:p.version+1,archived:input.archived,updatedAt:now};action=input.archived?'archived':'restored';detail=input.archived?'Registro arquivado; histórico preservado.':'Registro restaurado.';
 }
 return {...item,events:[...item.events,{id:eventId,at:now,by:actor.name,byId:actor.id,action,detail,status:item.status,...(resolvedOn?{resolvedOn}:{})}]};
}
export const complaintClientKey=(c:Pick<Complaint,'clientId'|'clientName'>)=>c.clientId||c.clientName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
export const complaintCategoryKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
export function complaintCategories(values:Iterable<string>){const names=new Map<string,string>();for(const label of [...COMPLAINT_CATEGORIES,...values]){const name=label.trim().replace(/\s+/g,' ');if(name&&!names.has(complaintCategoryKey(name)))names.set(complaintCategoryKey(name),name)}return [...names.values()]}
export function complaintRankings(items:Complaint[]){
 const counts=new Map<string,{label:string;count:number;open:number}>();
 const clients=new Map<string,{key:string;label:string;count:number;open:number}>();
 for(const c of items){if(c.archived)continue;const open=Number(c.status!=='resolved'),category=counts.get(complaintCategoryKey(c.category))??{label:c.category,count:0,open:0};category.count++;category.open+=open;counts.set(complaintCategoryKey(c.category),category);const key=complaintClientKey(c),client=clients.get(key)??{key,label:c.clientName,count:0,open:0};client.count++;client.open+=open;clients.set(key,client)}
 const sort=(a:{count:number;label:string},b:{count:number;label:string})=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR');
 return {motives:[...counts.values()].sort(sort),clients:[...clients.values()].sort(sort)};
}
export const complaintDeletion=z.object({id,version:z.number().int().min(1)}).strict();
export function groupComplaintsByClient(items:Complaint[]){
 const groups=new Map<string,{key:string;name:string;cases:Complaint[]}>();
 for(const item of items){const key=complaintClientKey(item),group=groups.get(key)??{key,name:item.clientName,cases:[]};group.cases.push(item);groups.set(key,group)}
 return [...groups.values()].map(group=>({...group,cases:group.cases.sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.key.localeCompare(b.key));
}
