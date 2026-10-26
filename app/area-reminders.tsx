'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,ChevronDown,Pencil,Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import './area-reminders.css';

type Reminder={id:string;version:number;area:'payroll'|'fines';text:string};
export default function AreaReminders({area,title,initialReminders=[]}:{area:Reminder['area'];title:string;initialReminders?:string[]}){
 const [items,setItems]=useState<Reminder[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[draft,setDraft]=useState<Reminder|null>(null),[busy,setBusy]=useState(false);
 const endpoint='/api/area-reminders?area='+area;
 useEffect(()=>{let active=true;setLoading(true);setError('');setItems([]);fetch(endpoint,{cache:'no-store'}).then(async response=>{const data=await response.json() as {reminders:Reminder[];error?:string};if(!response.ok)throw Error(data.error||'Não foi possível carregar os lembretes.');if(active)setItems(data.reminders)}).catch(error=>{if(active)setError(error.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[endpoint,reload]);
 async function save(event:React.FormEvent){
  event.preventDefault();if(!draft||busy)return;setBusy(true);
  try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)}),data=await response.json() as {reminder:Reminder;error?:string};if(!response.ok)throw Error(data.error||'Não foi possível salvar.');setItems(current=>current.some(item=>item.id===data.reminder.id)?current.map(item=>item.id===data.reminder.id?data.reminder:item):[...current,data.reminder]);setDraft(null);toast.success('Lembrete salvo')}
  catch(error){toast.error((error as Error).message)}finally{setBusy(false)}
 }
 async function remove(item:Reminder){
  if(busy||!confirm('Excluir este lembrete?'))return;setBusy(true);
  try{const response=await fetch(endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,version:item.version})}),data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error||'Não foi possível excluir.');setItems(current=>current.filter(row=>row.id!==item.id));toast.success('Lembrete excluído')}
  catch(error){toast.error((error as Error).message)}finally{setBusy(false)}
 }
 return <>
  <details className="area-reminders"><summary><CalendarDays size={18}/><strong>{title}</strong><span>{initialReminders.length+items.length}</span><ChevronDown size={17}/></summary><div className="area-reminders-body">
   {initialReminders.map((text,index)=><p className="area-reminder-default" key={index}>{text}</p>)}
   {loading?<p role="status">Carregando lembretes…</p>:error?<p role="alert">{error} <button className="secondary" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></p>:<>
    {items.map(item=><article key={item.id}><p>{item.text}</p><div><button type="button" disabled={busy} aria-label="Editar lembrete" onClick={()=>setDraft(item)}><Pencil size={15}/> Editar</button><button type="button" disabled={busy} aria-label="Excluir lembrete" onClick={()=>void remove(item)}><Trash2 size={15}/> Excluir</button></div></article>)}
    {!initialReminders.length&&!items.length&&<p>Nenhum lembrete cadastrado. Adicione o primeiro abaixo.</p>}
    <div className="area-reminders-actions"><button type="button" className="primary" disabled={busy} onClick={()=>setDraft({id:`areaReminder-${area}-${crypto.randomUUID()}`,area,version:0,text:''})}><Plus size={16}/> Adicionar lembrete</button><button type="button" className="secondary" disabled={busy} onClick={()=>setReload(value=>value+1)}>Atualizar lembretes</button></div>
   </>}
  </div></details>
  <Dialog open={!!draft} onOpenChange={open=>{if(!open&&!busy)setDraft(null)}}><DialogContent><DialogTitle>{draft?.version?'Editar lembrete':'Novo lembrete'}</DialogTitle><DialogDescription>{title}. O lembrete fica salvo para consultar sempre que precisar.</DialogDescription>{draft&&<form className="area-reminder-form" onSubmit={event=>void save(event)}><label>Lembrete<textarea autoFocus required maxLength={4000} rows={5} value={draft.text} onChange={event=>setDraft({...draft,text:event.target.value})} placeholder="Escreva o que precisa lembrar" disabled={busy}/></label><div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</button><button type="submit" className="primary" disabled={busy||!draft.text.trim()}>{busy?'Salvando…':'Salvar lembrete'}</button></div></form>}</DialogContent></Dialog>
 </>;
}
