'use client';
import {useState} from 'react';
import {currentPeriod} from '@/lib/month-rollover';
import ProfitabilityBilling from './profitability-billing';
import ProfitabilityProducts from './profitability-products';

export default function BillingWorkspace({admin}:{admin:boolean}){
 const [tab,setTab]=useState<'billing'|'products'>('billing'),[period,setPeriod]=useState(currentPeriod());
 const months=Array.from({length:24},(_,index)=>{const date=new Date(),month=new Date(date.getFullYear(),date.getMonth()-index,1);return `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`});
 return <div className="profit-page"><nav className="profit-view-tabs" aria-label="Abas do faturamento"><button aria-pressed={tab==='billing'} onClick={()=>setTab('billing')}>Faturamento</button><button aria-pressed={tab==='products'} onClick={()=>setTab('products')}>Controle dos produtos</button></nav>{tab==='billing'&&<div className="profit-controls"><label>Competência<select aria-label="Mês do faturamento" value={period} onChange={event=>setPeriod(event.target.value)}>{months.map(value=><option key={value} value={value}>{new Date(`${value}-02T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</option>)}</select></label></div>}{tab==='billing'?<ProfitabilityBilling period={period} admin={admin}/>:<ProfitabilityProducts admin={admin}/>}</div>;
}
