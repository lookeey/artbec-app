'use client';
import {useState} from 'react';
import {currentPeriod} from '@/lib/month-rollover';
import ProfitabilityBilling from './profitability-billing';
import ProfitabilityProducts from './profitability-products';

export default function BillingWorkspace({admin}:{admin:boolean}){
 const [tab,setTab]=useState<'billing'|'products'|'product-billing'>('billing');
 return <div className="profit-page"><nav className="profit-view-tabs" aria-label="Abas do faturamento"><button aria-pressed={tab==='billing'} onClick={()=>setTab('billing')}>Faturamento</button><button aria-pressed={tab==='products'} onClick={()=>setTab('products')}>Controle dos produtos</button><button aria-pressed={tab==='product-billing'} onClick={()=>setTab('product-billing')}>Faturamento dos produtos</button></nav>{tab==='billing'?<ProfitabilityBilling key="general" period={currentPeriod()} admin={admin}/>:tab==='products'?<ProfitabilityProducts admin={admin}/>:<ProfitabilityBilling key="products" period={currentPeriod()} admin={admin} scope="products"/>}</div>;
}
