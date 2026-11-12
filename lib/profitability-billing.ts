import {z} from 'zod';

const period=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const invoiceTaxRates={none:0,standard12:1200,boleto2:0,product:841,serviceWithoutWithholding:1237,serviceWithWithholding:835} as const;
export type InvoiceTaxType=keyof typeof invoiceTaxRates;
export const invoiceTaxAmount=(amount:number,taxType:InvoiceTaxType)=>taxType==='boleto2'?Math.min(200,amount):Math.round(amount*invoiceTaxRates[taxType]/10000);
export const billingEntrySchema=z.object({
 id:z.string().regex(/^billing-\d{4}-(0[1-9]|1[0-2])-[a-zA-Z0-9-]{8,80}$/),version:z.number().int().min(0),period,date,
 direction:z.enum(['income','expense']),category:z.string().trim().min(1).max(60),description:z.string().trim().max(240),client:z.string().trim().max(200).default(''),clients:z.array(z.string().trim().min(1).max(200)).max(300).default([]),technicianIds:z.array(z.string().max(100)).max(50).default([]),grossAmount:z.number().int().min(0).max(99999999900).nullable().default(null),amount:z.number().int().min(1).max(99999999900),status:z.enum(['confirmed','pending']),taxType:z.enum(['none','standard12','boleto2','product','serviceWithoutWithholding','serviceWithWithholding']).default('none'),boletoFee:z.boolean().default(false),
}).strict().refine(item=>item.direction==='income'||item.taxType==='none',{message:'Imposto da nota só pode ser aplicado a uma entrada.',path:['taxType']}).refine(item=>item.direction==='income'||!item.boletoFee,{message:'Desconto do boleto só pode ser aplicado a uma entrada.',path:['boletoFee']});
export const billingCloseSchema=z.object({period,version:z.number().int().min(0),closed:z.boolean()}).strict();
export type BillingEntry=z.infer<typeof billingEntrySchema>;
