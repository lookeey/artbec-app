import {z} from 'zod';
import {formatReminderList,reminderOpening,reminderOnDay,orderedReminders,type Reminder} from './reminders.ts';
export const reminderDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value});
export const dispatchInput=z.object({date:reminderDate,technician:z.string().trim().min(1).max(120),version:z.number().int().min(0),sent:z.boolean(),message:z.string().trim().max(200000)}).refine(item=>!item.sent||item.message.length>0);
export type ReminderDispatch=z.infer<typeof dispatchInput>&{id:string;sentAt:string;sentBy:string;updatedAt:string};
export function reminderLocalDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function reminderTomorrow(now=new Date()){const date=reminderLocalDate(now),d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
export function reminderDayForDate(date:string):Reminder['day']{return (['sun','mon','tue','wed','thu','fri','sat'] as const)[new Date(date+'T12:00:00Z').getUTCDay()]}
export function dailyReminders(items:Reminder[],date:string,technician:string){return orderedReminders(items.filter(item=>item.technician===technician&&reminderOnDay(item,reminderDayForDate(date))))}
export function dailyReminderMessage(items:Reminder[],date:string,technician:string,now=new Date()){const message=formatReminderList(dailyReminders(items,date,technician));if(!message||date===reminderTomorrow(now))return message;return message.replace(reminderOpening,'Boa Tarde! Tudo bem? Segue os lembretes de '+date.split('-').reverse().join('/'))}
export async function reminderDispatchId(date:string,technician:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(technician.trim()));return 'reminderDispatch-'+date+'-'+Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')}

export function sameReminderContent(first:string,second:string){return first.split('\n').slice(1).join('\n')===second.split('\n').slice(1).join('\n')}
