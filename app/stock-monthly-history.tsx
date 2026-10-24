'use client';
import {useEffect,useState} from 'react';
import {ArrowDownCircle,ArrowUpCircle,RefreshCw,Search} from 'lucide-react';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {currentPeriod,periodOptions} from '@/lib/month-rollover';
import type {StockHistoryEntry} from '@/lib/stock-history';
import './stock-monthly-history.css';

const units=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:4});
export default function StockMonthlyHistory(){
 const [entries,setEntries]=useState<StockHistoryEntry[]>([]),[period,setPeriod]=useState(currentPeriod),[direction,setDirection]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');fetch('/api/stock-history',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Não foi possível carregar as movimentações.');return response.json() as Promise<{entries:StockHistoryEntry[]}>}).then(data=>{if(active)setEntries(data.entries)}).catch(error=>{if(active)setError(error.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[reload]);
 const periods=periodOptions(entries.map(item=>item.date?item.date.slice(0,7):'sem-data'));
 const month=entries.filter(item=>(period==='sem-data'?!item.date:item.date.slice(0,7)===period)&&item.product.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
 const visible=month.filter(item=>direction==='all'||item.direction===direction),pages=Math.max(1,Math.ceil(visible.length/50)),currentPage=Math.min(page,pages-1),rows=visible.slice(currentPage*50,(currentPage+1)*50);
 return <section className="panel stock-monthly-history">
  <div className="panel-heading"><div><h2>Entradas e saídas por mês</h2><p>Confira as movimentações do período. O saldo dos produtos continua sendo o saldo atual.</p></div><button className="secondary" disabled={loading} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/> Atualizar</button></div>
  <div className="filters"><label>Mês das movimentações<select aria-label="Mês das movimentações" value={period} onChange={event=>{setPeriod(event.target.value);setPage(0)}}>{periods.map(value=><option key={value} value={value}>{value==='sem-data'?'Sem data':value.split('-').reverse().join('/')}</option>)}</select></label><label>Tipo<select aria-label="Tipo de movimentação" value={direction} onChange={event=>{setDirection(event.target.value);setPage(0)}}><option value="all">Entradas e saídas</option><option value="in">Entradas</option><option value="out">Saídas</option></select></label><label className="search"><Search size={18}/><input placeholder="Buscar produto nas movimentações" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}}/></label></div>
  {loading?<p role="status" className="stock-history-message">Carregando movimentações…</p>:error?<p role="alert" className="stock-history-message">{error} Use Atualizar para tentar novamente.</p>:<>
   <div className="stock-history-totals"><article><ArrowDownCircle/><div><span>Entradas no período</span><strong>{units(month.filter(item=>item.direction==='in').reduce((sum,item)=>sum+item.quantity,0))}</strong><small>unidades</small></div></article><article><ArrowUpCircle/><div><span>Saídas no período</span><strong>{units(month.filter(item=>item.direction==='out').reduce((sum,item)=>sum+item.quantity,0))}</strong><small>unidades</small></div></article></div>
   {period==='sem-data'&&<p className="stock-history-message">Quantidades antigas sem data registrada. Elas não entram nos totais de um mês específico.</p>}
   {rows.length?<Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Produto</TableHead><TableHead>Quantidade</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader><TableBody>{rows.map(item=><TableRow key={item.id}><TableCell>{item.date?item.date.split('-').reverse().join('/'):'Sem data'}</TableCell><TableCell><span className={'stock-history-direction '+item.direction}>{item.direction==='in'?'Entrada':'Saída'}</span></TableCell><TableCell><strong>{item.product}</strong></TableCell><TableCell>{units(item.quantity)}</TableCell><TableCell>{item.description}</TableCell></TableRow>)}</TableBody></Table>:<p className="stock-history-message">Nenhuma movimentação encontrada neste período.</p>}
   <div className="table-footer"><span>{visible.length} movimentações</span><div><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</button><span>{currentPage+1} / {pages}</span><button disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Próxima</button></div></div>
  </>}
 </section>;
}
