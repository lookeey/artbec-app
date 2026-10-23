type Actor={id:string;displayName:string};
type Original={table:string;id:string;data:Record<string,unknown>};
export function auditedDatabase(db:D1Database,actor:Actor,originals:Map<string,Original>):D1Database{
 const metadata=new WeakMap<object,{native:D1PreparedStatement;sql:string;params:unknown[]}>();
 const tracked=(sql:string)=>/^\s*(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+["\x60]?(finance_changes|note_changes|fine_changes|management_changes|operation_changes|monthly_reviews)\b/i.test(sql);
 function wrap(native:D1PreparedStatement,sql:string,params:unknown[]=[]):D1PreparedStatement{
  const proxy=new Proxy(native,{get(target,key){
   if(key==='bind')return (...values:unknown[])=>wrap(target.bind(...values),sql,values);
   if(key==='run'&&tracked(sql))return async()=>{const result=await execute([proxy]);return result[0]};
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});metadata.set(proxy,{native,sql,params});return proxy;
 }
 async function execute(statements:D1PreparedStatement[]){
  const infos=statements.map(s=>metadata.get(s));
  if(!infos.some(i=>i&&tracked(i.sql)))return db.batch(statements.map((s,i)=>infos[i]?.native??s));
  const seeds=new Map<string,Original>();
  for(const info of infos){if(!info||!tracked(info.sql))continue;const table=info.sql.match(/(?:INTO|UPDATE|FROM)\s+["\x60]?([a-z_]+)/i)?.[1];if(!table)continue;
   for(const param of info.params){if(typeof param!=='string')continue;const original=originals.get(table+':'+param);if(original)seeds.set(table+':'+param,original);
    if(param.startsWith('[')){try{const rows=JSON.parse(param);if(Array.isArray(rows))for(const row of rows){const original=originals.get(table+':'+row?.id);if(original)seeds.set(table+':'+row.id,original)}}catch{/* Not a JSON bulk insert. */}}
   }
  }
  const before=[...seeds].map(([key,row])=>db.prepare('INSERT OR IGNORE INTO audit_originals (key,data) VALUES (?,?)').bind(key,JSON.stringify(row.data)));
  before.push(db.prepare('INSERT INTO audit_context (id,actor_id,actor_name) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET actor_id=excluded.actor_id,actor_name=excluded.actor_name').bind(actor.id,actor.displayName));
  // D1 meta.changes includes writes made by audit triggers. Read SQLite's
  // direct changes immediately after each tracked write in the same batch;
  // changes() excludes triggers and remains zero for a rejected version guard.
  const writes:D1PreparedStatement[]=[],positions:{result:number;count?:number}[]=[];
  statements.forEach((statement,index)=>{
   const position:{result:number;count?:number}={result:before.length+writes.length};
   writes.push(infos[index]?.native??statement);
   if(infos[index]&&tracked(infos[index]!.sql)){
    position.count=before.length+writes.length;
    writes.push(db.prepare('SELECT changes() AS direct_changes'));
   }
   positions.push(position);
  });
  const result=await db.batch([...before,...writes,db.prepare('DELETE FROM audit_context WHERE id=1')]);
  return positions.map(position=>{
   const saved=result[position.result];
   if(position.count===undefined)return saved;
   const count=Number((result[position.count].results[0] as {direct_changes:number}).direct_changes);
   if(!Number.isSafeInteger(count)||count<0)throw new Error('Não foi possível confirmar a gravação.');
   return {...saved,meta:{...saved.meta,changes:count}};
  });
 }
 return new Proxy(db,{get(target,key){if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),sql);if(key==='batch')return execute;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}) as D1Database;
}
