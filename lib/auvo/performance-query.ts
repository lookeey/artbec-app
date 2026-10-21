import {z} from 'zod';
export const performanceQuery=z.object({start:z.string().date(),end:z.string().date(),technicianId:z.string().regex(/^\d+$/).max(20).optional()}).refine(value=>value.start<=value.end&&Date.parse(value.end)-Date.parse(value.start)<=365*86400000,{message:'Selecione um período válido de até 366 dias.'});
