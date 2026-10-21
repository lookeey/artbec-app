import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/** @param {string|Uint8Array} body @param {{expectedSha256?:string,output?:string}} options */
export function verifyBackup(body,{expectedSha256,output=':memory:'}={}){
 const bytes=typeof body==='string'?Buffer.from(body):Buffer.from(body),sha256=createHash('sha256').update(bytes).digest('hex');
 if(expectedSha256&&sha256!==expectedSha256)throw Error('A integridade SHA-256 do backup não confere.');
 const dump=JSON.parse(bytes.toString('utf8'));
 if(dump.format!=='artbec-d1-dump-v1'||!dump.tables||!Array.isArray(dump.importedBase)||!Number.isFinite(Date.parse(dump.exportedAt))||Object.keys(dump.tables).length!==dump.tableCount)throw Error('Estrutura de backup inválida.');
 const entries=Object.entries(dump.tables);let expectedRows=0;
 for(const [name,table] of entries){if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)||typeof table.schema!=='string'||!/^CREATE TABLE\b/i.test(table.schema.trim())||!Array.isArray(table.rows)||table.rowCount!==table.rows.length)throw Error('Tabela inválida ou incompleta: '+name);expectedRows+=table.rows.length}
 if(output!==':memory:'&&existsSync(output))throw Error('A base de destino já existe; escolha um arquivo novo.');
 const db=new DatabaseSync(output),quote=s=>'"'+s.replaceAll('"','""')+'"';
 try{
  db.exec('PRAGMA foreign_keys=OFF; BEGIN');
  for(const [,table] of entries)db.exec(table.schema);
  for(const [name,table] of entries){const columns=db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name);for(const row of table.rows){const keys=Object.keys(row);if(keys.some(k=>!columns.includes(k)))throw Error('Coluna desconhecida em '+name);if(!keys.length)throw Error('Linha vazia em '+name);db.prepare('INSERT INTO '+quote(name)+' ('+keys.map(quote).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]))}}
  // Recreate triggers only after rows: replaying them during imports duplicates audit events.
  for(const object of dump.objects??[])if(object.sql){if(!['index','trigger'].includes(object.type))throw Error('Objeto desconhecido.');db.exec(object.sql)}
  let restoredRows=0;
  for(const [name,table] of entries){const actual=Number(db.prepare('SELECT COUNT(*) AS n FROM '+quote(name)).get().n);if(actual!==table.rowCount)throw Error('Contagem divergente em '+name);restoredRows+=actual;const rows=db.prepare('SELECT * FROM '+quote(name)).all();const stable=row=>JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k]]));if(JSON.stringify(rows.map(stable).sort())!==JSON.stringify(table.rows.map(stable).sort()))throw Error('Conteúdo divergente em '+name)}
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Vínculos inconsistentes após restauração.');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Falha na integridade da cópia restaurada.');
  db.exec('COMMIT');return {verified:true,tableCount:entries.length,expectedRows,restoredRows,importedBaseRows:dump.importedBase.length,sha256,scope:dump.scope??'',output:output===':memory:'?'Cópia temporária em memória':output};
 }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}finally{db.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const args=process.argv.slice(2);if(!args[0])throw Error('Informe o JSON de backup para verificar em uma cópia isolada.');const opt=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;console.log(JSON.stringify(verifyBackup(readFileSync(args[0]),{expectedSha256:opt('--sha256'),output:opt('--output')??':memory:'})))}catch(error){console.error(error.message);process.exitCode=1}}
