import type {Complaint} from './complaints';
export type ComplaintPhoto={key:string;name:string;mime:string;size:number;addedAt:string};
export const complaintPhotoKey=(key:string)=>/^complaint-photos\/complaint-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(key);
export function attachComplaintPhoto(item:Complaint,photo:ComplaintPhoto,actor:{id:string;name:string},now:string,eventId:string):Complaint{
 if(item.archived)throw Error('Restaure a reclamação antes de adicionar fotos.');
 if(!complaintPhotoKey(photo.key)||!photo.key.startsWith('complaint-photos/'+item.id+'/'))throw Error('Foto inválida para esta reclamação.');
 if((item.photos??[]).length>=10)throw Error('Esta reclamação já tem 10 fotos.');
 return {...item,version:item.version+1,updatedAt:now,photos:[...(item.photos??[]),photo],events:[...item.events,{id:eventId,at:now,by:actor.name,byId:actor.id,action:'photo_added',detail:'Foto adicionada: '+photo.name,status:item.status,photo}]};
}
