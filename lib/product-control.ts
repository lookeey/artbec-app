import {z} from 'zod';

export const productControlSchema=z.object({
 id:z.string().regex(/^product-control-[0-9a-f-]{36}$/i),version:z.number().int().min(0),
 product:z.string().trim().min(1).max(300),residentialPrice:z.number().int().min(0).max(99999999900).nullable(),
 commercialPrice:z.number().int().min(0).max(99999999900).nullable(),cost:z.number().int().min(0).max(99999999900).nullable(),
 invoiceTaxPercent:z.number().min(0).max(100).nullable(),notes:z.string().trim().max(500),
}).strict();
export type ProductControl=z.infer<typeof productControlSchema>;
