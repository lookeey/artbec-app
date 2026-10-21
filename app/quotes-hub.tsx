'use client';
import {useState} from 'react';
import {FileText,ShoppingBag} from 'lucide-react';
import QuotesPanel from './quotes-panel';
import ProcurementPanel from './procurement-panel';
export default function QuotesHub(){const [tab,setTab]=useState('clients');return <><div className="pq-hub" role="tablist" aria-label="Orçamentos e cotações"><button role="tab" aria-selected={tab==='clients'} onClick={()=>setTab('clients')}><FileText size={18}/>Orçamentos para clientes</button><button role="tab" aria-selected={tab==='suppliers'} onClick={()=>setTab('suppliers')}><ShoppingBag size={18}/>Cotações de fornecedores</button></div><div hidden={tab!=='clients'}><QuotesPanel/></div><div hidden={tab!=='suppliers'}><ProcurementPanel/></div></>}
