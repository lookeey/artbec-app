'use client';
import {useEffect,useState} from 'react';
import {AlertTriangle,ChevronLeft,ChevronRight,CalendarDays} from 'lucide-react';
import {COMPLAINT_STATUSES,type Complaint} from '@/lib/complaints';
import {businessToday} from '@/lib/month-rollover';
import {complaintWeekStart,moveComplaintDay,complaintsForWeek,pendingComplaints,complaintPendingDays} from '@/lib/complaint-week';
const date=(s:string)=>s.split('-').reverse().join('/');
export function ComplaintPending({items,today,open}:{items:Complaint[];today:string;open:(id:string)=>void}){
 const pending=pendingComplaints(items,today),[expanded,setExpanded]=useState(false);
 if(!pending.length)return null;
 return <aside className="complaint-pending" aria-label="Alertas de reclamações"><header><AlertTriangle size={21}/><div><strong>{pending.length} reclamaç{pending.length===1?'ão precisa':'ões precisam'} de solução</strong><p>Continuam aqui até a baixa, mesmo quando a semana virar.</p></div><button onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Recolher':'Ver pendências'}</button></header>{expanded&&<div className="complaint-week-list">{pending.map(c=><button key={c.id} onClick={()=>open(c.id)}><span><strong>{c.clientName} · {c.title}</strong><small>Precisa resolver · {complaintPendingDays(c,today)} dia(s) em aberto{c.dueOn?' · Prazo '+date(c.dueOn):''}</small></span><b>{c.dueOn&&c.dueOn<today?'Prazo vencido':COMPLAINT_STATUSES[c.status]}</b></button>)}</div>}</aside>
}
export function ComplaintWeek({items,today,open}:{items:Complaint[];today:string;open:(id:string)=>void}){
 const [chosen,setChosen]=useState<string|null>(null),[status,setStatus]=useState('all');
 const start=chosen??complaintWeekStart(today),end=moveComplaintDay(start,6),all=complaintsForWeek(items,start),shown=complaintsForWeek(items,start,status);
 const days=Array.from({length:7},(_,i)=>moveComplaintDay(start,i));
 return <section className="complaint-week"><header><div><span>SEGUNDA A DOMINGO</span><h3>Reclamações da semana</h3><p>{date(start)} a {date(end)} · Pela data da reclamação</p></div><nav aria-label="Escolher semana"><button aria-label="Semana anterior" onClick={()=>setChosen(moveComplaintDay(start,-7))}><ChevronLeft size={18}/></button><button onClick={()=>setChosen(null)}>Semana atual</button><button aria-label="Próxima semana" disabled={start>=complaintWeekStart(today)} onClick={()=>setChosen(moveComplaintDay(start,7))}><ChevronRight size={18}/></button></nav></header>
 <div className="complaint-week-summary"><span><b>{all.length}</b> recebidas</span><span><b>{all.filter(c=>c.status!=='resolved').length}</b> não resolvidas</span><span><b>{all.filter(c=>c.status==='resolved').length}</b> resolvidas</span></div>
 <div className="complaint-week-status" aria-label="Filtrar situação semanal">{[['all','Todas'],['unresolved','Não resolvidas'],['resolved','Resolvidas']].map(([key,label])=><button key={key} aria-pressed={status===key} className={status===key?'active':''} onClick={()=>setStatus(key)}>{label}</button>)}</div>
 {!shown.length?<div className="complaints-empty"><CalendarDays size={30}/><p>Nenhuma reclamação {status==='unresolved'?'não resolvida ':status==='resolved'?'resolvida ':''}nesta semana.</p></div>:days.map(day=>{const rows=shown.filter(c=>c.occurredOn===day);return rows.length?<section className="complaint-week-day" key={day}><h4>{new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))} · {date(day)} <span>{rows.length}</span></h4><div className="complaint-week-list">{rows.map(c=><button key={c.id} onClick={()=>open(c.id)}><span><strong>{c.clientName} · {c.title}</strong><small>{c.category} · {c.owner||'Sem responsável'}{c.dueOn?' · Prazo '+date(c.dueOn):''}</small></span><b className={c.status==='resolved'?'resolved':''}>{c.status==='resolved'?'Resolvida':c.dueOn&&c.dueOn<today?'Prazo vencido':COMPLAINT_STATUSES[c.status]}</b></button>)}</div></section>:null})}
 </section>
}
export function useComplaintToday(){
 const [today,setToday]=useState(()=>businessToday());
 useEffect(()=>{const update=()=>setToday(businessToday());const timer=setInterval(update,60000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update)}},[]);
 return today;
}
