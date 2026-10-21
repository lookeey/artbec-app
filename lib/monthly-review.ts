export const REVIEW_ITEMS=[
 {key:'monthly',title:'Mensalidades e recebimentos',description:'Conferir vencimentos, pagamentos, valores em aberto e comprovantes.',view:'monthly'},
 {key:'sales',title:'Vendas e entregas de produtos',description:'Conferir produtos vendidos, entregues, pendentes e cobranças.',view:'product-sales'},
 {key:'services',title:'Serviços e notas',description:'Conferir serviços realizados, pagamentos e notas a emitir.',view:'services'},
 {key:'payroll',title:'Folha de pagamentos',description:'Conferir salários, adiantamentos, empréstimos, multas e descontos.',view:'payroll'},
 {key:'stock',title:'Estoque e movimentações',description:'Conferir entradas, saídas, reservas e contagem física.',view:'inventory'},
 {key:'expenses',title:'Despesas e veículos',description:'Conferir gasolina, óleo, manutenção e demais despesas do mês.',view:'expense-overview'},
 {key:'complaints',title:'Pendências com os clientes',description:'Revisar reclamações, tarefas e problemas sem solução.',view:'complaints'},
 {key:'backup',title:'Cópia de segurança',description:'Conferir a data do backup e guardar uma cópia em local protegido.',view:'backup'},
] as const;
export type ReviewKey=typeof REVIEW_ITEMS[number]['key'];
export type ReviewItem={key:ReviewKey;done:boolean;note:string;version:number;checkedBy:string;checkedAt:string;updatedBy:string;updatedAt:string};
export const REVIEW_PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
export function reviewId(period:string,key:string){return period+':'+key}
export function reviewItems(rows:{data:string;version:number}[]):ReviewItem[]{const saved=new Map(rows.map(row=>{const item=JSON.parse(row.data);return [item.key,{...item,version:row.version}]}));return REVIEW_ITEMS.map(({key})=>saved.get(key)??{key,done:false,note:'',version:0,checkedBy:'',checkedAt:'',updatedBy:'',updatedAt:''})}
