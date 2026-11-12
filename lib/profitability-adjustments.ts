import {z} from 'zod';

const period=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const cents=z.number().int().min(0).max(99999999900).nullable();
const count=z.number().int().min(0).max(100000).nullable();
const hours=z.number().min(0).max(10000).nullable();
export const profitabilityAdjustmentSchema=z.object({
 id:z.string().regex(/^profitability-\d{4}-(0[1-9]|1[0-2])$/),version:z.number().int().min(0),period,
 technicians:z.record(z.string().max(100),z.object({visits:count,hours,weeklyHours:z.array(hours).length(5).default([null,null,null,null,null]),excludedBillingEntryIds:z.array(z.string().max(120)).max(500).default([]),revenueUnassigned:cents,payrollCost:cents,fuelCost:cents,oilCost:cents,maintenanceCost:cents,otherCost:cents})),
 customers:z.record(z.string().max(500),z.object({visits:count,hours,revenue:cents,technicianIds:z.array(z.string().max(100)).max(50).default([])})),
}).strict();
export type ProfitabilityAdjustment=z.infer<typeof profitabilityAdjustmentSchema>;
export type TechnicianAdjustment=ProfitabilityAdjustment['technicians'][string];
export type CustomerAdjustment=ProfitabilityAdjustment['customers'][string];
export const emptyProfitabilityAdjustment=(period:string):ProfitabilityAdjustment=>({id:`profitability-${period}`,version:0,period,technicians:{},customers:{}});
export const profitabilityCustomerKey=(name:string)=>`client:${name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim()}`;
