'use client';
import {useState} from 'react';
import {currentPeriod} from '@/lib/month-rollover';
import ProfitabilityBilling from './profitability-billing';
import ProfitabilityProducts from './profitability-products';

export default function BillingWorkspace({admin}:{admin:boolean}){
 const [tab,setTab]=useState<'billing'|'products'>('billing');
 return <div className="profit-page"><nav className="profit-view-tabs" aria-label="Abas do faturamento"><button aria-pressed={tab==='billing'} onClick={()=>setTab('billing')}>Faturamento</button><button aria-pressed={tab==='products'} onClick={()=>setTab('products')}>Controle dos produtos</button></nav>{tab==='billing'?<ProfitabilityBilling period={currentPeriod()} admin={admin}/>:<ProfitabilityProducts admin={admin}/>}</div>;
}
