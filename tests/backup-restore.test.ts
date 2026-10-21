import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyBackup} from '../scripts/verify-backup.mjs';

test('restauração isolada preserva conteúdo, vínculos, histórico e auditoria sem repetir eventos',()=>{
 const value={format:'artbec-d1-dump-v1',exportedAt:'2026-10-20T12:00:00Z',tableCount:3,importedBase:[{table:'finance_changes',id:'import-1',data:{amount:30000}}],tables:{customers:{schema:'CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT)',rowCount:1,rows:[{id:'client-1',name:'Ana'}]},sales:{schema:'CREATE TABLE sales(id TEXT PRIMARY KEY,client TEXT REFERENCES customers(id),data TEXT)',rowCount:1,rows:[{id:'s1',client:'client-1',data:JSON.stringify({amount:30000,photos:['private/photo.png'],history:[{event:'updated'}]})}]},audit:{schema:'CREATE TABLE audit(id INTEGER PRIMARY KEY,event TEXT)',rowCount:1,rows:[{id:1,event:'created'}]}},objects:[{type:'trigger',name:'sale_audit',sql:"CREATE TRIGGER sale_audit AFTER INSERT ON sales BEGIN INSERT INTO audit(event) VALUES ('created'); END"}]};
 const body=JSON.stringify(value),sha256=createHash('sha256').update(body).digest('hex');const result=verifyBackup(body,{expectedSha256:sha256});assert.equal(result.verified,true);assert.equal(result.restoredRows,3);assert.equal(result.importedBaseRows,1);assert.throws(()=>verifyBackup(body+' ',{expectedSha256:sha256}),/SHA-256/);assert.throws(()=>verifyBackup(JSON.stringify({...value,tableCount:4})),/inválida/);value.tables.sales.rows[0].client='missing';assert.throws(()=>verifyBackup(JSON.stringify(value)),/Vínculos/);
});
