import test from 'node:test';
import assert from 'node:assert/strict';
import {AuvoApiError,AuvoClient,clearAuvoToken} from './client.ts';
import {normalizeAuvoUser,normalizeTaskTiming} from './types.ts';

const jwt=()=>`x.${btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800}))}.x`;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const credentials={apiKey:'test-key',apiToken:'test-token'};

test('reutiliza o JWT enquanto estiver válido',async()=>{clearAuvoToken();let logins=0;const fetcher:typeof fetch=async(input)=>{const url=String(input);if(url.endsWith('/login')){logins++;return response({result:{accessToken:jwt()}})}return response({result:{entityList:[],pagedSearchReturnData:{totalItems:0}}})};const client=new AuvoClient(credentials,fetcher);await client.request('/users?page=1&pageSize=1');await client.request('/users?page=1&pageSize=1');assert.equal(logins,1)});
test('renova o JWT uma vez após resposta 401',async()=>{clearAuvoToken();let logins=0,calls=0;const fetcher:typeof fetch=async(input)=>{const url=String(input);if(url.endsWith('/login')){logins++;return response({result:{accessToken:jwt()}})}calls++;return calls===1?response({},401):response({ok:true})};const result=await new AuvoClient(credentials,fetcher).request<{ok:boolean}>('/users');assert.equal(result.ok,true);assert.equal(logins,2);assert.equal(calls,2)});
test('falha de autenticação não expõe credenciais',async()=>{clearAuvoToken();const fetcher:typeof fetch=async()=>response({error:'invalid'},401);await assert.rejects(()=>new AuvoClient(credentials,fetcher).test(),(error:unknown)=>error instanceof AuvoApiError&&error.status===401&&!error.message.includes(credentials.apiKey))});
test('percorre todas as páginas sem duplicar a primeira',async()=>{clearAuvoToken();const pages:number[]=[];const fetcher:typeof fetch=async(input)=>{const url=new URL(String(input));if(url.pathname.endsWith('/login'))return response({result:{accessToken:jwt()}});const page=Number(url.searchParams.get('page'));pages.push(page);return response({result:{entityList:page===1?[{id:1},{id:2}]:[{id:3}],pagedSearchReturnData:{totalItems:3,page,pageSize:2}}})};const rows=await new AuvoClient(credentials,fetcher).listAll<{id:number}>('/users',{},5);assert.deepEqual(rows.map(row=>row.id),[1,2,3]);assert.deepEqual(pages,[1,2])});
test('normaliza o identificador userID retornado pelo Auvo',()=>{assert.deepEqual(normalizeAuvoUser({userID:42,name:' Técnico '}),{id:42,name:'Técnico',externalId:null,email:null,jobPosition:null,active:1})});
test('calcula a duração pelos horários de chegada e saída',()=>{assert.deepEqual(normalizeTaskTiming({taskID:7,taskDate:'2026-09-01',taskStatus:5,checkInDate:'2026-09-01T08:10:00',checkOutDate:'2026-09-01T09:25:00'}),{taskID:7,arrivalDate:'2026-09-01T08:10:00',departureDate:'2026-09-01T09:25:00',durationMinutes:75})});
