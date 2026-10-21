'use client';

import {useMemo,useState} from 'react';
import {PackageMinus} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {suggestedDeliveryItems,type DeliveryAllocation,type StockAvailability} from '@/lib/stock-delivery';
import type {SaleItem} from './operations-panel';

export default function DeliveryStockDialog({sale,stock,busy,close,confirm,editSale}:{sale:SaleItem;stock:StockAvailability[];busy:boolean;close:()=>void;confirm:(items:DeliveryAllocation[],deliveredAt:string)=>Promise<void>;editSale:()=>void}){
 const rows=useMemo<DeliveryAllocation[]>(()=>sale.stockItems?.length?sale.stockItems:sale.lineItems?.length?sale.lineItems.flatMap(line=>suggestedDeliveryItems(line.product,line.quantity,stock)):suggestedDeliveryItems(sale.product,sale.quantity,stock),[sale,stock]);
 const [deliveredAt,setDeliveredAt]=useState(()=>{if(sale.deliveredAt)return sale.deliveredAt;return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())});
 const own=sale.deliveryStatus==='delivered'?sale.stockItems??[]:[];
 const availableFor=(productId:string)=>(stock.find(item=>item.id===productId)?.available??0)+own.filter(item=>item.productId===productId).reduce((sum,item)=>sum+item.quantity,0);
 const totalFor=(productId:string)=>rows.filter(item=>item.productId===productId).reduce((sum,item)=>sum+item.quantity,0);
 const linked=rows.length>0&&rows.every(item=>item.productId&&stock.some(product=>product.id===item.productId)&&Number.isFinite(item.quantity)&&item.quantity>0);
 const insufficient=linked&&rows.some(item=>totalFor(item.productId)>availableFor(item.productId)+0.00001);
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close()}}><DialogContent className="edit-dialog delivery-stock-dialog">
  <DialogTitle><PackageMinus size={20}/> Confirmar entrega</DialogTitle>
  <DialogDescription>Confirme a data da entrega para {sale.client}. O estoque será atualizado com os produtos e as quantidades desta venda.</DialogDescription>
  <div className="delivery-stock-sale"><strong>{sale.product}</strong>{sale.lineItems?.length?<small>{sale.lineItems.map(line=>line.product+' · '+(line.quantity??1)+' unidade(s)').join(' / ')}</small>:<small>{sale.quantity!==null?sale.quantity+' unidade(s) na venda':''}</small>}</div>
  <label>Data em que foi entregue<input type="date" required value={deliveredAt} onChange={event=>setDeliveredAt(event.target.value)} disabled={busy}/></label>
  {!linked&&<p className="delivery-stock-warning">Confira os produtos desta venda: algum item não foi encontrado no estoque. Use o nome cadastrado no estoque ao editar a venda.</p>}
  {insufficient&&<p className="delivery-stock-warning">O saldo do estoque é insuficiente para esta entrega. Atualize o estoque antes de confirmar.</p>}
  <div className="form-actions"><button type="button" className="secondary" onClick={close} disabled={busy}>Cancelar</button>{!linked&&<button type="button" className="secondary" onClick={editSale} disabled={busy}>Editar venda</button>}<button type="button" className="primary" disabled={busy||!linked||insufficient||!deliveredAt} onClick={()=>void confirm(rows,deliveredAt)}>{busy?'Salvando…':'Confirmar entrega'}</button></div>
 </DialogContent></Dialog>;
}
