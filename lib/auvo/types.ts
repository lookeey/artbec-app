export const AuvoTaskStatus={Opened:1,InDisplacement:2,CheckedIn:3,CheckedOut:4,Finished:5,Paused:6} as const;
export type AuvoTaskStatus=(typeof AuvoTaskStatus)[keyof typeof AuvoTaskStatus];

export const AUVO_TASK_STATUS_LABELS:Record<number,string>={
 [AuvoTaskStatus.Opened]:'Aberta',
 [AuvoTaskStatus.InDisplacement]:'Em deslocamento',
 [AuvoTaskStatus.CheckedIn]:'Atendimento iniciado',
 [AuvoTaskStatus.CheckedOut]:'Saída registrada',
 [AuvoTaskStatus.Finished]:'Finalizada',
 [AuvoTaskStatus.Paused]:'Pausada',
};

export type AuvoCredentials={apiKey:string;apiToken:string};
export type AuvoListEnvelope<T>={result?:{entityList?:T[];pagedSearchReturnData?:{page?:number;pageSize?:number;totalItems?:number}}};
export type AuvoUser={userID?:number;userId?:number;id?:number;externalId?:string|null;name?:string;description?:string;email?:string|null;jobPosition?:string|null;unavailableForTasks?:boolean;active?:boolean};
export type AuvoTask={taskID:number;externalId?:string|null;idUserTo?:number|null;customerId?:number|null;taskType?:number|null;taskTypeDescription?:string|null;creationDate?:string|null;taskDate:string;checkInDate?:string|null;checkOutDate?:string|null;duration?:string|number|null;durationDecimal?:string|number|null;priority?:number|null;finished?:boolean;taskStatus:number};
export type AuvoTaskTiming={taskID:number;arrivalDate:string|null;departureDate:string|null;durationMinutes:number|null};
export type AuvoCustomer={id?:number;customerId?:number;name?:string;description?:string};

export function normalizeAuvoUser(user:AuvoUser){const id=Number(user.userID??user.userId??user.id),name=String(user.name??user.description??'').trim();if(!Number.isInteger(id)||id<=0||!name)return null;return {id,name,externalId:user.externalId??null,email:user.email??null,jobPosition:user.jobPosition??null,active:user.active===false||user.unavailableForTasks?0:1}}
export function normalizeTaskTiming(task:AuvoTask):AuvoTaskTiming{const arrivalDate=task.checkInDate||null,departureDate=task.checkOutDate||null,start=arrivalDate?new Date(arrivalDate).getTime():NaN,end=departureDate?new Date(departureDate).getTime():NaN,fromDates=Number.isFinite(start)&&Number.isFinite(end)&&end>start?Math.round((end-start)/60000):null,decimal=Number(task.durationDecimal),fromDecimal=Number.isFinite(decimal)&&decimal>0?Math.round(decimal*60):null;return {taskID:Number(task.taskID),arrivalDate,departureDate,durationMinutes:fromDates??fromDecimal}}

export function isAuvoTaskStatus(value:number):value is AuvoTaskStatus{return value>=1&&value<=6}
