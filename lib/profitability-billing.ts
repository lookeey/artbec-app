import {z} from 'zod';

const period=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const invoiceTaxRates={none:0,standard12:1200,product:841,serviceWithoutWithholding:1237,serviceWithWithholding:835} as const;
export type InvoiceTaxType=keyof typeof invoiceTaxRates;
export const invoiceTaxAmount=(amount:number,taxType:InvoiceTaxType)=>Math.round(amount*invoiceTaxRates[taxType]/10000);
export const billingEntrySchema=z.object({
 id:z.string().regex(/^billing-\d{4}-(0[1-9]|1[0-2])-[a-zA-Z0-9-]{8,80}$/),version:z.number().int().min(0),period,date,
 direction:z.enum(['income','expense']),category:z.string().trim().min(1).max(60),description:z.string().trim().max(240),client:z.string().trim().max(200).default(''),clients:z.array(z.string().trim().min(1).max(200)).max(300).default([]),grossAmount:z.number().int().min(0).max(99999999900).nullable().default(null),amount:z.number().int().min(1).max(99999999900),status:z.enum(['confirmed','pending']),taxType:z.enum(['none','standard12','product','serviceWithoutWithholding','serviceWithWithholding']).default('none'),
}).strict().refine(item=>item.direction==='income'||item.taxType==='none',{message:'Imposto da nota só pode ser aplicado a uma entrada.',path:['taxType']});
export const billingCloseSchema=z.object({period,version:z.number().int().min(0),closed:z.boolean()}).strict();
export type BillingEntry=z.infer<typeof billingEntrySchema>;
