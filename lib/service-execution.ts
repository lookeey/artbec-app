import {z} from 'zod';
export const calendarDate=z.string().refine(value=>{if(value==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value+'T12:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value});
export const serviceExecutionFields={serviceStatus:z.enum(['unknown','pending','done']).optional(),serviceDate:calendarDate.optional(),serviceScheduledDate:calendarDate.optional()};
export function validServiceExecution(value:{kind:string;serviceStatus?:string;serviceDate?:string}){return value.kind!=='Serviço'||value.serviceStatus!=='done'||!!value.serviceDate}
