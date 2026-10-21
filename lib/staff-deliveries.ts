import {z} from 'zod';
export const realDeliveryDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const day=z.string().refine(realDeliveryDate),optionalDay=z.union([day,z.literal('')]);
export const staffDeliverySchema=z.object({id:z.string().uuid(),staffId:z.string().regex(/^staff-[a-z0-9-]+$/i),version:z.number().int().min(0),category:z.enum(['uniform','epi','tool']),item:z.string().trim().min(1).max(180),size:z.string().trim().max(80),quantity:z.number().int().min(1).max(10000),deliveredOn:day,replacementOn:optionalDay,receivedConfirmed:z.boolean(),notes:z.string().trim().max(2000)}).strict().refine(v=>!v.replacementOn||v.replacementOn>=v.deliveredOn,{message:'Reposição anterior à entrega.'});
export type StaffDelivery={id:string;staffId:string;staffName:string;version:number;category:'uniform'|'epi'|'tool';item:string;size:string;quantity:number;deliveredOn:string;replacementOn:string;receivedConfirmed:boolean;notes:string;returnedOn:string;createdBy:string;createdAt:string;updatedBy:string;updatedAt:string};
export const deliveryCategory={uniform:'Uniforme',epi:'EPI',tool:'Ferramenta'};
export function deliveryState(item:StaffDelivery,today:string){return item.returnedOn?'Devolvido':item.replacementOn&&item.replacementOn<=today?'Reposição a conferir':'Em uso'}
