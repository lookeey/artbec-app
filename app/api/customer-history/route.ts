import {authorize,canAccess} from '@/lib/auth';
import {database,getRecords} from '@/lib/finance-store';
import {getManagement} from '@/lib/management-store';
import {getOperations} from '@/lib/operations-store';
import {customerRecordMatcher,type CustomerHistorySection} from '@/lib/customer-history';
import {generateOccurrences,type MaintenancePlan} from '@/lib/preventive-maintenance';
import {businessToday} from '@/lib/month-rollover';
import type {Complaint} from '@/lib/complaints';
export async function GET(request:Request){
 const auth=await authorize(request,['clients']);if(auth.error)return auth.error;
 try{
 const id=new URL(request.url).searchParams.get('id')??'',management=await getManagement(),client=management.customers.find(c=>c.id===id);if(!client)return Response.json({error:'Cliente não encontrado.'},{status:404});
 const match=customerRecordMatcher(client,management.customers),user=auth.user!,monthly=canAccess(user,'monthly')||canAccess(user,'overview'),services=canAccess(user,'services')||canAccess(user,'overview'),products=['product-sales','product-agenda'].some(v=>canAccess(user,v)),complaints=canAccess(user,'complaints'),maintenance=canAccess(user,'preventive-maintenance');
 const [records,operations,complaintRows,planRows,doneRows]=await Promise.all([
 monthly||services?getRecords():Promise.resolve([]),products?getOperations():Promise.resolve(null),
 complaints?database().prepare("SELECT data,version FROM operation_changes WHERE entity='complaint' AND deleted=0").all<{data:string;version:number}>():Promise.resolve(null),
 maintenance?database().prepare("SELECT data FROM operation_changes WHERE entity='maintenancePlan' AND deleted=0").all<{data:string}>():Promise.resolve(null),
 maintenance?database().prepare("SELECT id,data FROM operation_changes WHERE entity='maintenanceOccurrence' AND deleted=0").all<{id:string;data:string}>():Promise.resolve(null),
 ]);
 const sections:CustomerHistorySection[]=[];
 if(monthly)sections.push({key:'monthly',title:'Mensalidades',rows:records.filter(r=>r.kind==='Mensalidade'&&match(r)).map(r=>({id:r.id,date:r.date,title:r.period,detail:r.payment||'Forma não informada',status:r.status==='paid'?'Pago':r.status==='review'?'Conferir':'Em aberto',amount:r.amount}))});
 if(products)sections.push({key:'products',title:'Produtos comprados',rows:(operations?.sales??[]).filter(r=>r.channel==='Clientes'&&match(r)).map(r=>({id:r.id,date:r.deliveredAt||r.deliveryDate||r.date,title:r.product,detail:r.deliveryStatus==='delivered'?'Entregue':'A entregar',status:r.status==='paid'?'Pago':'A receber',amount:r.total}))});
 if(services)sections.push({key:'services',title:'Serviços',rows:records.filter(r=>r.kind==='Serviço'&&match(r)).map(r=>({id:r.id,date:r.serviceDate||r.serviceScheduledDate||r.date,title:r.description||'Serviço',detail:r.serviceDate?'Realizado em '+r.serviceDate.split('-').reverse().join('/'):r.serviceScheduledDate?'Agendado para '+r.serviceScheduledDate.split('-').reverse().join('/'):'Sem data de visita',status:r.serviceStatus==='done'?'Realizado':r.serviceStatus==='pending'?'A realizar':'A confirmar',amount:r.amount}))});
 if(complaints)sections.push({key:'complaints',title:'Reclamações',rows:(complaintRows?.results??[]).map(r=>JSON.parse(r.data) as Complaint).filter(match).map(c=>({id:c.id,date:c.occurredOn,title:c.title,detail:c.category+' · '+(c.resolution||c.description)+(c.archived?' · Arquivada':''),status:c.status==='resolved'?(c.clientConfirmation?'Cliente confirmou':'Equipe concluiu · falta confirmar'):'Em acompanhamento'}))});
 if(maintenance){
 const completed=new Map((doneRows?.results??[]).filter(r=>JSON.parse(r.data).done).map(r=>[r.id,JSON.parse(r.data).completedAt as string]));
 const plans=(planRows?.results??[]).map(r=>JSON.parse(r.data) as MaintenancePlan).filter(match),through=new Date(businessToday()+'T12:00:00Z');through.setUTCFullYear(through.getUTCFullYear()+1);
 const occurrences=generateOccurrences(plans.map(p=>({...p,active:true})),completed,through.toISOString().slice(0,10)),byId=new Map(plans.map(p=>[p.id,p]));
 sections.push({key:'maintenance',title:'Manutenções preventivas',note:'Histórico e previsões até os próximos 12 meses. Planos inativos aparecem somente nas execuções já registradas.',rows:occurrences.filter(o=>byId.get(o.planId)?.active||o.done).map(o=>({id:o.id,date:o.dueDate,title:o.title,detail:(o.owner||'Sem responsável')+(o.done?' · Concluída em '+o.completedAt.slice(0,10).split('-').reverse().join('/'):' · Previsão recorrente'),status:o.done?'Realizada':o.dueDate<businessToday()?'Pendente · vencida':'Programada'}))});
 }
 for(const section of sections)section.rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return Response.json({clientId:id,sections,asOf:new Date().toISOString(),matchingNote:'Os vínculos usam o ID do cliente ou o nome exato normalizado quando ele é único. Nomes diferentes ou ambíguos não são agrupados automaticamente.'},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){console.error('Customer history failed',error);return Response.json({error:'Não foi possível carregar a ficha completa.'},{status:503})}
}
