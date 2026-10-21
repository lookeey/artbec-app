'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,BellRing} from 'lucide-react';
import type {AlertGroup} from '@/lib/home-alerts';

export default function HomeAlerts({navigate,allowed}:{navigate:(view:string)=>void;allowed:Set<string>}){
 const [alerts,setAlerts]=useState<AlertGroup[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch('/api/home-alerts',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();return await response.json() as {alerts:AlertGroup[]}}).then(value=>{if(active)setAlerts(value.alerts)}).catch(()=>{if(active)setError(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const visible=alerts.filter(item=>allowed.has(item.view));
 return <section className="home-alerts"><div className="home-section-title"><div><p className="eyebrow">ATENÇÃO AGORA</p><h2><BellRing size={22}/> Central de alertas</h2></div><span>Atualizada ao abrir a página</span></div>{loading&&<p className="home-alert-clear">Conferindo pendências…</p>}{error&&<p className="home-alert-error">Não foi possível carregar os alertas agora. Atualize a página para tentar novamente.</p>}{!loading&&!error&&visible.length>0&&visible.every(item=>item.count===0)&&<p className="home-alert-clear">Nenhuma pendência nos controles que você pode acessar.</p>}<div className="home-alert-grid">{visible.map(item=><button key={item.key} className={`home-alert-card ${item.tone} ${item.count?'active':''}`} onClick={()=>navigate(item.view)}><span>{item.title}</span><strong>{item.count}</strong>{item.items.length?<div>{item.items.map((entry,index)=><small key={index}><b>{entry.title}</b> · {entry.detail}</small>)}</div>:<small>Sem pendências</small>}<em>Abrir aba <ArrowUpRight size={14}/></em></button>)}</div></section>;
}
