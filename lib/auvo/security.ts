import {env} from 'cloudflare:workers';

const encoder=new TextEncoder(),decoder=new TextDecoder();
function encode(value:Uint8Array){let raw='';for(const byte of value)raw+=String.fromCharCode(byte);return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function decode(value:string){const normalized=value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=');const raw=atob(normalized);return Uint8Array.from(raw,char=>char.charCodeAt(0))}
async function key(secret:string){if(secret.length<32)throw new Error('Chave de criptografia Auvo não configurada.');const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function encryptSecret(value:string,secret=env.AUVO_ENCRYPTION_KEY??''){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),encoder.encode(value));return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`}
export async function decryptSecret(value:string,secret=env.AUVO_ENCRYPTION_KEY??''){const [version,iv,cipher]=value.split('.');if(version!=='v1'||!iv||!cipher)throw new Error('Credencial Auvo inválida.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await key(secret),decode(cipher));return decoder.decode(plain)}
export function safeError(error:unknown){if(error instanceof Error&&error.message)return error.message.replace(/api(Key|Token)\s*[:=]\s*\S+/gi,'credencial protegida').slice(0,500);return 'Falha inesperada na integração Auvo.'}
