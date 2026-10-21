export type TaskStep={id:string;text:string;done:boolean};
export type ResolutionTask={id:string;version:number;title:string;detail:string;category:'Operação'|'Cliente'|'Financeiro'|'Equipe'|'Outros';priority:'low'|'medium'|'high';owner:string;dueDate:string;status:'open'|'done';steps:TaskStep[];resolution:string;createdAt:string;createdBy:string;updatedAt:string;resolvedAt:string;resolvedBy:string};

export function taskProgress(task:ResolutionTask){const total=task.steps.length,done=task.steps.filter(step=>step.done).length;return {total,done,percent:total?Math.round(done/total*100):0}}
export function isTaskLate(task:ResolutionTask,today:string){return task.status==='open'&&Boolean(task.dueDate&&task.dueDate<today)}
export function sortOpenTasks(items:ResolutionTask[],today:string){const rank={high:0,medium:1,low:2};return [...items].sort((a,b)=>Number(isTaskLate(b,today))-Number(isTaskLate(a,today))||rank[a.priority]-rank[b.priority]||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))}
