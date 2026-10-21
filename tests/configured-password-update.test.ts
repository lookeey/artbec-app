import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyConfiguredPasswordUpdate,PASSWORD_UPDATE_ID} from '../lib/configured-password-update.ts';
test('the owner requested password update runs only once and revokes sessions without changing permissions',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE operation_changes(id TEXT PRIMARY KEY,entity TEXT,data TEXT,version INTEGER,deleted INTEGER,updated_at TEXT);CREATE TABLE app_users(id TEXT PRIMARY KEY,username TEXT,password_hash TEXT,password_salt TEXT,updated_at TEXT,role TEXT,permissions TEXT,active INTEGER);CREATE TABLE app_sessions(user_id TEXT);');
 const users=[['user-luiz','luiz'],['user-muriel','muriel'],['user-marilene','marilene'],['user-leticia','leticia']];
 for(const [id,name] of users){sqlite.prepare("INSERT INTO app_users VALUES (?,?,'before','before','before',?,'[]',1)").run(id,name,name==='leticia'?'admin':'member');sqlite.prepare('INSERT INTO app_sessions VALUES (?)').run(id)}
 const db={prepare(sql:string){let values:(string|number|null)[]=[];const handle={bind(...args:(string|number|null)[]){values=args;return handle},async first(){return sqlite.prepare(sql).get(...values)??null},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}};return handle},async batch(statements:{run:()=>Promise<unknown>}[]){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 await applyConfiguredPasswordUpdate(db);
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM app_sessions').get()!.n,0);
 const result=sqlite.prepare('SELECT * FROM app_users').all();
 assert.equal(result.length,4);assert.equal(new Set(result.map(r=>r.password_salt)).size,4);
 for(const row of result){assert.notEqual(row.password_hash,'before');assert.equal(row.permissions,'[]');assert.equal(row.active,1)}
 assert.equal(result.find(r=>r.id==='user-leticia')!.role,'admin');
 const record=sqlite.prepare('SELECT data FROM operation_changes WHERE id=?').get(PASSWORD_UPDATE_ID)!;
 assert.equal(String(record.data).includes('password_hash'),false);
 sqlite.exec("UPDATE app_users SET password_hash='later' WHERE id='user-leticia';INSERT INTO app_sessions VALUES ('user-leticia')");
 await applyConfiguredPasswordUpdate(db);
 assert.equal(sqlite.prepare("SELECT password_hash FROM app_users WHERE id='user-leticia'").get()!.password_hash,'later');
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM app_sessions').get()!.n,1);
 assert.equal(sqlite.prepare('SELECT count(*) as n FROM operation_changes').get()!.n,1);
});

