// Server-only, one-time update explicitly requested by the site owner.
export const PASSWORD_UPDATE_ID="credentialUpdate-fb7a3519-6f16-4c96-b59f-d9fc473783cb";
const configured=[
  {
    "id": "user-luiz",
    "username": "luiz",
    "salt": "ZY5mx4lfa1jr0qIHJR26gA==",
    "hash": "tMbosyfOs9kW/tZLZzWRrgNBoOoDVQMLKMhAV9NsMBI="
  },
  {
    "id": "user-muriel",
    "username": "muriel",
    "salt": "Ry2E6wNQrr4S5rh31k1Skg==",
    "hash": "in00LSbNbvFMGrfOsHvCmsxfDFXLPK3KwCGJDLeW6fw="
  },
  {
    "id": "user-marilene",
    "username": "marilene",
    "salt": "QLFJvH+pPrdQEDT7ec5/Ug==",
    "hash": "/sq7kTEVtTPOclRuD12mC7oQaEbBHWU35Hs24rw6T/Y="
  },
  {
    "id": "user-leticia",
    "username": "leticia",
    "salt": "ZjDLGUUOEcSiavKK2/sPig==",
    "hash": "1nMgaG54qV5o0DntUHrkPPzoPmasUgLTalkSvwEsnzo="
  }
];
export async function applyConfiguredPasswordUpdate(db:D1Database){
 const found=await db.prepare("SELECT id FROM operation_changes WHERE id=? AND entity='credentialUpdate'").bind(PASSWORD_UPDATE_ID).first();
 if(found)return;
 const execution=crypto.randomUUID(),now=new Date().toISOString(),data=JSON.stringify({id:PASSWORD_UPDATE_ID,execution,users:configured.map(u=>u.id),requestedOn:'2026-10-19',description:'Atualização pontual de senhas solicitada pela administradora. Credenciais não são registradas no histórico.'});
 const gate=db.prepare("INSERT OR IGNORE INTO operation_changes(id,entity,data,version,deleted,updated_at) VALUES (?,'credentialUpdate',?,1,0,?)").bind(PASSWORD_UPDATE_ID,data,now);
 const guard="EXISTS(SELECT 1 FROM operation_changes WHERE id=? AND entity='credentialUpdate' AND json_extract(data,'$.execution')=?)";
 const updates=configured.map(u=>db.prepare('UPDATE app_users SET password_hash=?,password_salt=?,updated_at=? WHERE id=? AND username=? AND '+guard).bind(u.hash,u.salt,now,u.id,u.username,PASSWORD_UPDATE_ID,execution));
 const sessions=configured.map(u=>db.prepare('DELETE FROM app_sessions WHERE user_id=? AND '+guard).bind(u.id,PASSWORD_UPDATE_ID,execution));
 await db.batch([gate,...updates,...sessions]);
}
