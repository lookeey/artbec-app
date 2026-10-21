export type PersonalTask={id:string;title:string;date:string;done:boolean;version:number};
// Ownership is always supplied by the authenticated session, never by form data.
export const PERSONAL_TASK_SQL={
 list:'SELECT id,title,task_date as date,done,version FROM personal_tasks WHERE user_id=? AND task_date=? AND deleted=0 ORDER BY created_at,id',
 current:'SELECT version,deleted FROM personal_tasks WHERE id=? AND user_id=?',
 save:'INSERT INTO personal_tasks (id,user_id,title,task_date,done,version,deleted,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT(id,user_id) DO UPDATE SET title=excluded.title,task_date=excluded.task_date,done=excluded.done,version=excluded.version,updated_at=excluded.updated_at WHERE personal_tasks.version=? AND personal_tasks.deleted=0',
 remove:'UPDATE personal_tasks SET deleted=1,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND deleted=0',
 exportOwn:'SELECT * FROM personal_tasks WHERE user_id=?'
};
