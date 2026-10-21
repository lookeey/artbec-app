import {z} from 'zod';

export const stages={quoting:'Em cotação',chosen:'Escolhida',ordered:'Pedido realizado',received:'Recebida'} as const;
export const purchaseId=z.string().regex(/^purchase-[0-9a-f-]{36}$/i);
const attachment=z.object({key:z.string().max(250),name:z.string().max(200),type:z.enum(['image/png','image/jpeg','application/pdf'])});
const cents=z.number().int().min(0).max(999999999);
export const proposalSchema=z.object({id:z.string().uuid(),supplier:z.string().trim().max(160),contact:z.string().max(200),specifications:z.string().max(2500),quantity:z.number().positive().max(100000),unitCents:cents,freightCents:cents,installationCents:cents,discountCents:cents,deliveryDays:z.number().int().min(0).max(3650).nullable(),warrantyMonths:z.number().int().min(0).max(600).nullable(),payment:z.string().max(500),validUntil:z.string().date().or(z.literal('')),notes:z.string().max(2000),attachments:z.array(attachment).max(10)});
export const purchaseSchema=z.object({id:purchaseId,version:z.number().int().min(0),title:z.string().trim().min(3).max(180),client:z.string().max(200),specifications:z.string().max(3000),stage:z.enum(['quoting','chosen','ordered','received']),winnerId:z.string().max(40),reason:z.string().max(1500),proposals:z.array(proposalSchema).min(1).max(12)}).superRefine((p,ctx)=>{
 if(new Set(p.proposals.map(s=>s.id)).size!==p.proposals.length)ctx.addIssue({code:'custom',message:'Há propostas duplicadas.'});
 for(const s of p.proposals)if(s.discountCents>Math.round(s.quantity*s.unitCents)+s.freightCents+s.installationCents)ctx.addIssue({code:'custom',message:'O desconto não pode superar o valor da proposta.'});
 if(p.stage!=='quoting'&&(!p.proposals.some(s=>s.id===p.winnerId&&s.supplier.trim())||!p.reason.trim()))ctx.addIssue({code:'custom',message:'Selecione o fornecedor e informe o motivo da escolha.'});
 if(p.winnerId&&!p.proposals.some(s=>s.id===p.winnerId&&s.supplier.trim()))ctx.addIssue({code:'custom',message:'Fornecedor escolhido inválido.'});
});
export type Proposal=z.infer<typeof proposalSchema>;
export type Purchase=z.infer<typeof purchaseSchema>;
export const proposalTotal=(s:Proposal)=>Math.round(s.quantity*s.unitCents)+s.freightCents+s.installationCents-s.discountCents;
export const money=(c:number)=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function highlights(proposals:Proposal[]){const filled=proposals.filter(s=>s.supplier.trim());return {lowest:Math.min(...filled.map(proposalTotal)),fastest:Math.min(...filled.flatMap(s=>s.deliveryDays===null?[]:[s.deliveryDays])),warranty:Math.max(0,...filled.flatMap(s=>s.warrantyMonths===null?[]:[s.warrantyMonths]))}}
export function blankProposal(specifications=''):Proposal{return {id:crypto.randomUUID(),supplier:'',contact:'',specifications,quantity:1,unitCents:0,freightCents:0,installationCents:0,discountCents:0,deliveryDays:null,warrantyMonths:null,payment:'',validUntil:'',notes:'',attachments:[]}}
