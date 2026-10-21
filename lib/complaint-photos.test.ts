import test from 'node:test';
import assert from 'node:assert/strict';
import {attachComplaintPhoto,complaintPhotoKey} from './complaint-photos.ts';
import {applyComplaintMutation,type ComplaintFields} from './complaints.ts';
const id='complaint-11111111-1111-4111-8111-111111111111',actor={id:'leticia',name:'Letícia'},now='2026-10-15T13:00:00Z',today='2026-10-15';
const fields:ComplaintFields={clientId:'client-1',clientName:'Ana',title:'Timer',description:'Timer com defeito.',occurredOn:today,category:'Timer',priority:'normal',owner:'',dueOn:''};
const create=()=>applyComplaintMutation(null,{action:'save',id,version:0,fields},actor,now,today,'created');
const photo={key:'complaint-photos/'+id+'/22222222-2222-4222-8222-222222222222.png',name:'timer.png',mime:'image/png',size:120,addedAt:now};
test('photos stay linked after editing, resolving and reopening the complaint',()=>{
 const first=create(),attached=attachComplaintPhoto(first,photo,actor,now,'photo');
 const edited=applyComplaintMutation(attached,{action:'save',id,version:2,fields:{...fields,owner:'Esdras'}},actor,now,today,'edited');
 const done=applyComplaintMutation(edited,{action:'followup',id,version:3,status:'resolved',message:'Timer substituído.',resolvedOn:today},actor,now,today,'resolved');
 const reopened=applyComplaintMutation(done,{action:'followup',id,version:4,status:'open',message:'Novo retorno.',resolvedOn:''},actor,now,today,'reopened');
 assert.equal(first.photos?.length,0);assert.equal(reopened.photos?.[0].key,photo.key);assert.equal(reopened.events[1].action,'photo_added');assert.equal(reopened.events[1].photo?.name,'timer.png');assert.equal(reopened.events[1].by,'Letícia');assert.equal(reopened.version,5);
});
test('photo paths are restricted to the right complaint and image extensions',()=>{
 assert.equal(complaintPhotoKey(photo.key),true);assert.equal(complaintPhotoKey(photo.key.replace('.png','.svg')),false);assert.equal(complaintPhotoKey('../'+photo.key),false);
 assert.throws(()=>attachComplaintPhoto({...create(),id:'complaint-33333333-3333-4333-8333-333333333333'},photo,actor,now,'e'));
});
test('archived complaints and full galleries do not accept more images',()=>{
 assert.throws(()=>attachComplaintPhoto({...create(),archived:true},photo,actor,now,'e'));
 assert.throws(()=>attachComplaintPhoto({...create(),photos:Array(10).fill(photo)},photo,actor,now,'e'));
});
