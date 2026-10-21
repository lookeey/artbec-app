import {z} from 'zod';
import {calendarDate} from './service-execution.ts';
export const manualCashSchema=z.object({id:z.string().regex(/^cashManual-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),version:z.number().int().min(0),date:calendarDate.refine(Boolean),direction:z.enum(['in','out']),certainty:z.enum(['confirmed','expected']),category:z.string().trim().min(1).max(100),label:z.string().trim().min(1).max(300),amount:z.number().int().positive().max(99999999900),payment:z.string().max(100),note:z.string().trim().max(1000)}).strict();
export type ManualCash=z.infer<typeof manualCashSchema>;
export const manualCashSaveSQL="INSERT INTO operation_changes (id,entity,data,version,deleted,updated_at) VALUES (?,'cashManual',?,?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE operation_changes.entity='cashManual' AND operation_changes.deleted=0 AND operation_changes.version=?";
