import {env} from 'cloudflare:workers';
import type {AuthUser} from './auth';
import {PERSONAL_TASK_SQL} from './personal-tasks';
import {originalBusinessRows} from './original-business';
import {businessToday} from './month-rollover';
export type BackupRow={id:string;object_key:string;created_at:string;created_by:string;row_count:number;table_count:number;sha256:string;size:number};
const bucket=()=>((env as unknown) as {DOCUMENTS:R2Bucket}).DOCUMENTS;
export async function createBusinessDump(db:D1Database,user:Pick<AuthUser,'id'>){
 const found=await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','trigger','index') AND name NOT LIKE 'sqlite_%' AND substr(name,1,4)!='_cf_' ORDER BY type,name").all<{type:string;name:string;sql:string|null}>();
 const info=found.results.filter(t=>t.type==='table'),statements=info.map(t=>t.name==='personal_tasks'?db.prepare(PERSONAL_TASK_SQL.exportOwn).bind(user.id):db.prepare('SELECT * FROM "'+t.name.replaceAll('"','""')+'"'));
 const result=await db.batch<Record<string,unknown>>(statements),tables:Record<string,{schema:string|null;rowCount:number;rows:Record<string,unknown>[]}>={};
 info.forEach((t,i)=>{const rows=result[i].results;tables[t.name]={schema:t.sql,rowCount:rows.length,rows}});
 const dump={format:'artbec-d1-dump-v1',exportedAt:new Date().toISOString(),tableCount:info.length,tables,importedBase:originalBusinessRows,objects:found.results.filter(t=>t.type!=='table'),scope:'Banco D1 e base importada. Meu dia contém somente tarefas da pessoa que gerou a cópia. Fotos e documentos permanecem no armazenamento de arquivos, referenciados por suas chaves.'};
 return {dump,body:JSON.stringify(dump),rowCount:Object.values(tables).reduce((s,t)=>s+t.rowCount,0),tableCount:info.length};
}
export async function createSafetyBackup(db:D1Database,user:AuthUser,daily:boolean){
 const id=daily?'daily-'+businessToday():'manual-'+crypto.randomUUID();
 const previous=await db.prepare('SELECT * FROM safety_backups WHERE id=?').bind(id).first<BackupRow>();if(previous)return previous;
 const {body,rowCount,tableCount}=await createBusinessDump(db,user),bytes=new TextEncoder().encode(body),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const key='security-backups/'+id+'-'+crypto.randomUUID()+'.json',at=new Date().toISOString();
 await bucket().put(key,bytes,{httpMetadata:{contentType:'application/json'},customMetadata:{sha256:sha}});
 try{const result=await db.prepare('INSERT OR IGNORE INTO safety_backups(id,object_key,created_at,created_by,row_count,table_count,sha256,size) VALUES (?,?,?,?,?,?,?,?)').bind(id,key,at,user.displayName,rowCount,tableCount,sha,bytes.length).run();
 if(!result.meta.changes){await bucket().delete(key);return (await db.prepare('SELECT * FROM safety_backups WHERE id=?').bind(id).first<BackupRow>())!}
 return {id,object_key:key,created_at:at,created_by:user.displayName,row_count:rowCount,table_count:tableCount,sha256:sha,size:bytes.length};
 }catch(error){await bucket().delete(key);throw error}
}
export async function downloadSafetyBackup(row:BackupRow){
 const file=await bucket().get(row.object_key);if(!file)return Response.json({error:'Arquivo de backup indisponível.'},{status:404});
 return new Response(file.body,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="artbec-backup-'+row.id+'.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
