'use client';

import {useState} from 'react';
import {currentPeriod} from '@/lib/month-rollover';
import {CalendarDays,FileWarning,Pencil,Plus,Search,ShieldCheck,Trash2,WalletCards} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {fineInstallmentAmount,shiftPeriod} from '@/lib/fine-payroll';
import type {FineItem} from './management-panel';
import AreaReminders from './area-reminders';

const brl=(cents:number|null)=>((cents??0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):value||'Não informado';
const labels:Record<string,string>={pending:'Pendente',paid:'Paga',appeal:'Em recurso'};
const month=(value:string)=>value?value.split('-').reverse().join('/'):'Mês não definido';

export default function FinesPanel({fines,query,setQuery,filter,setFilter,ready,savingIds,add,edit,remove,change,save}:{fines:FineItem[];query:string;setQuery:(value:string)=>void;filter:string;setFilter:(value:string)=>void;ready:boolean;savingIds:string[];add:()=>void;edit:(item:FineItem)=>void;remove:(item:FineItem)=>void;change:(item:FineItem,status:string)=>void;save:(item:FineItem)=>Promise<void>}){
 const visible=fines.filter(item=>(filter==='all'||item.status===filter)&&`${item.technician} ${item.plate} ${item.description}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).sort((a,b)=>a.technician.localeCompare(b.technician,'pt-BR')||a.id.localeCompare(b.id)),linked=fines.filter(item=>item.deductFromPayroll&&item.status!=='appeal'),installmentCount=fines.filter(item=>(item.installments??1)>1).length;
 return <div className="fines-v2 fines-modern">
  <header className="fines-modern-hero"><div><span className="fines-modern-eyebrow">GESTÃO DA EQUIPE</span><h2>Controle de multas</h2><p>Organize cada multa e programe os descontos com clareza.</p></div><button className="primary" onClick={add} disabled={!ready}><Plus size={18}/> Adicionar multa</button></header>
  <div className="fines-modern-stats"><article className="blue"><span><FileWarning size={20}/></span><small>Multas registradas</small><strong>{fines.length}</strong><p>cadastros atuais</p></article><article className="rose"><span><WalletCards size={20}/></span><small>Valor total</small><strong>{brl(fines.reduce((sum,item)=>sum+(item.amount??0),0))}</strong><p>{fines.filter(item=>item.amount!==null).length} com valor informado</p></article><article className="violet"><span><CalendarDays size={20}/></span><small>Parceladas</small><strong>{installmentCount}</strong><p>em mais de um mês</p></article><article className="green"><span><ShieldCheck size={20}/></span><small>Vinculadas à folha</small><strong>{linked.length}</strong><p>desconto automático</p></article></div>
  <section className="fines-modern-filter"><label className="search"><Search size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar técnico, placa ou infração" aria-label="Buscar multas"/></label><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filtrar multas"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{Object.entries(labels).map(([value,text])=><SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select><small>{visible.length} multa{visible.length===1?'':'s'}</small></section>
  <section className="fines-modern-grid" aria-label="Multas da equipe">{visible.map(fine=>{const disabled=!ready||savingIds.includes(fine.id);return <article className={'fines-modern-card status-'+fine.status} key={fine.id}>
   <header><div className="fines-modern-person"><span>{fine.technician.split(' ').filter(Boolean).map(word=>word[0]).join('').slice(0,2)}</span><div><h3>{fine.technician}</h3><small>{fine.plate||'Placa não informada'}</small></div></div><Select value={fine.status} onValueChange={status=>void change(fine,status)} disabled={disabled}><SelectTrigger aria-label={`Situação da multa de ${fine.technician}`} className={'fines-modern-status '+fine.status}><SelectValue/></SelectTrigger><SelectContent>{Object.entries(labels).map(([value,text])=><SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select></header>
   <div className="fines-modern-description"><span>INFRAÇÃO</span><p>{fine.description}</p></div>
   <div className="fines-modern-details"><div><WalletCards size={17}/><small>Valor da multa</small><strong>{fine.amount===null?'Não informado':brl(fine.amount)}</strong></div><div><CalendarDays size={17}/><small>Vencimento</small><strong>{date(fine.dueDate)}</strong></div></div>
   <FinePaymentControls key={[fine.id,fine.installments,fine.deductFromPayroll,fine.payrollStartPeriod].join('-')} fine={fine} disabled={disabled} save={save}/>
   <footer><button disabled={disabled} onClick={()=>edit(fine)}><Pencil size={15}/> Editar dados</button><button disabled={disabled} className="danger" onClick={()=>remove(fine)} aria-label={`Excluir multa de ${fine.technician}`}><Trash2 size={15}/> Excluir</button></footer>
  </article>})}</section>
  {!visible.length&&<div className="fines-modern-empty"><ShieldCheck size={32}/><h3>Nenhuma multa encontrada</h3><p>Altere os filtros ou adicione uma nova multa.</p></div>}
  <p className="fines-v2-footnote">O desconto começa no mês escolhido e segue mensalmente pelo número de parcelas. Multas em recurso ficam suspensas.</p>
  <AreaReminders area="fines" title="Lembretes das multas"/>
 </div>;

}

function FinePaymentControls({fine,disabled,save}:{fine:FineItem;disabled:boolean;save:(item:FineItem)=>Promise<void>}){
 const [parcelled,setParcelled]=useState((fine.installments??1)>1),[count,setCount]=useState(String(Math.max(2,fine.installments??2))),[deduct,setDeduct]=useState(!!fine.deductFromPayroll),[start,setStart]=useState(fine.payrollStartPeriod||currentPeriod()),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const installments=parcelled?Number(count):1,period=deduct?start:(fine.payrollStartPeriod??''),dirty=installments!==(fine.installments??1)||deduct!==!!fine.deductFromPayroll||period!==(fine.payrollStartPeriod??''),valid=Number.isInteger(installments)&&installments>=1&&installments<=36&&(!parcelled||installments>=2)&&(!deduct||(!!fine.amount&&/^\d{4}-(0[1-9]|1[0-2])$/.test(start))),locked=disabled||saving;
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!dirty||!valid||locked)return;setSaving(true);setError('');try{await save({...fine,installments,deductFromPayroll:deduct,payrollStartPeriod:period})}catch(reason){setError((reason as Error).message)}finally{setSaving(false)}}
 return <form className={'fine-inline-payment '+(deduct?'active':'')} onSubmit={event=>void submit(event)} aria-label={`Parcelamento e folha de ${fine.technician}`}>
  <div className="fine-inline-title"><ShieldCheck size={17}/><strong>Pagamento e folha</strong></div>
  <div className="fine-inline-grid"><label>Parcelar?<select value={parcelled?'yes':'no'} disabled={locked} onChange={event=>{setParcelled(event.target.value==='yes');setError('')}}><option value="no">Não, à vista</option><option value="yes">Sim, parcelar</option></select></label>
   {parcelled&&<label>Parcelas<input type="number" min={2} max={36} required value={count} disabled={locked} onChange={event=>{setCount(event.target.value);setError('')}}/></label>}
   <label>Descontar na folha?<select value={deduct?'yes':'no'} disabled={locked} onChange={event=>{setDeduct(event.target.value==='yes');setError('')}}><option value="no">Não</option><option value="yes">Sim, automático</option></select></label>
   {deduct&&<label>Primeiro mês<input type="month" required value={start} disabled={locked} onChange={event=>{setStart(event.target.value);setError('')}}/></label>}
  </div>
  <div className="fine-inline-preview" aria-live="polite">{valid&&fine.amount!==null&&<span>{parcelled?`${installments} parcelas a partir de ${brl(fineInstallmentAmount(fine.amount,installments,0))}`:`À vista: ${brl(fine.amount)}`}{deduct?` · ${month(start)}${installments>1?` até ${month(shiftPeriod(start,installments-1))}`:''}`:' · Sem desconto em folha'}</span>}{deduct&&!fine.amount&&<span className="fine-inline-error">Informe o valor da multa no cadastro para descontar na folha.</span>}{deduct&&fine.status==='appeal'&&<span>Desconto suspenso enquanto a multa estiver em recurso.</span>}</div>
  <div className="fine-inline-actions"><small>{dirty?'Alterações não salvas':'Configuração salva'}</small><button type="submit" disabled={locked||!dirty||!valid}>{saving?'Salvando…':'Salvar opções'}</button></div>
  {error&&<p className="fine-inline-error" role="alert">{error}</p>}
 </form>;
}
