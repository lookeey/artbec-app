import type {Complaint} from './complaints.ts';
export type ComplaintAlertCase=Pick<Complaint,'id'|'clientName'|'title'|'occurredOn'|'status'|'archived'|'dueOn'|'priority'>;
export function moveComplaintDay(day:string,days:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function complaintWeekStart(day:string){const weekday=new Date(day+'T12:00:00Z').getUTCDay();return moveComplaintDay(day,-((weekday+6)%7))}
export function complaintsForWeek<T extends ComplaintAlertCase>(items:T[],start:string,status='all'){
 const end=moveComplaintDay(start,6);
 return items.filter(c=>!c.archived&&c.occurredOn>=start&&c.occurredOn<=end&&(status==='all'||(status==='unresolved'?c.status!=='resolved':c.status===status))).sort((a,b)=>a.occurredOn.localeCompare(b.occurredOn)||a.id.localeCompare(b.id));
}
export function pendingComplaints<T extends ComplaintAlertCase>(items:T[],today:string){
 const rank={urgent:0,high:1,normal:2};
 return items.filter(c=>!c.archived&&c.status!=='resolved'&&c.occurredOn<=today).sort((a,b)=>Number(!!b.dueOn&&b.dueOn<today)-Number(!!a.dueOn&&a.dueOn<today)||rank[a.priority]-rank[b.priority]||a.occurredOn.localeCompare(b.occurredOn)||a.id.localeCompare(b.id));
}
export function complaintPendingDays(item:ComplaintAlertCase,today:string){return Math.max(0,Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(item.occurredOn+'T12:00:00Z'))/86400000))}
