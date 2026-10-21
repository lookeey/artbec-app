'use client';
import {useRef,useState} from 'react';
import {Camera,Download,ImagePlus,LoaderCircle,Maximize2,UploadCloud} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {Complaint} from '@/lib/complaints';
import type {ComplaintPhoto} from '@/lib/complaint-photos';
const photoUrl=(photo:ComplaintPhoto)=>'/api/complaint-photos?key='+encodeURIComponent(photo.key);
export function ComplaintPhotoGallery({photos}:{photos:ComplaintPhoto[]}){
 const [view,setView]=useState<ComplaintPhoto|null>(null);
 return <><div className="complaint-photo-grid">{photos.map(photo=><figure key={photo.key}><button type="button" aria-label={'Ampliar '+photo.name} onClick={()=>setView(photo)}><img src={photoUrl(photo)} alt={photo.name} loading="lazy"/><span><Maximize2 size={17}/></span></button><figcaption><span title={photo.name}>{photo.name}</span><a href={photoUrl(photo)+'&download=1'} download aria-label={'Baixar '+photo.name}><Download size={15}/></a></figcaption></figure>)}</div><Dialog open={!!view} onOpenChange={open=>{if(!open)setView(null)}}><DialogContent className="complaint-photo-viewer"><DialogTitle>Foto da reclamação</DialogTitle><DialogDescription>{view?.name}</DialogDescription>{view&&<><img src={photoUrl(view)} alt={view.name}/><a className="secondary" href={photoUrl(view)+'&download=1'} download><Download size={16}/> Baixar foto</a></>}</DialogContent></Dialog></>;
}
export default function ComplaintPhotos({item,disabled,onChange,onBusy}:{item:Complaint;disabled:boolean;onChange:(item:Complaint)=>void;onBusy:(busy:boolean)=>void}){
 const input=useRef<HTMLInputElement>(null),uploading=useRef(false),[dragging,setDragging]=useState(false),[progress,setProgress]=useState<{done:number;total:number;name:string}|null>(null),photos=item.photos??[];
 async function upload(files:File[]){
  if(uploading.current||disabled||!files.length)return;
  if(files.length+photos.length>10){toast.error('Você pode adicionar mais '+(10-photos.length)+' foto(s) nesta reclamação.');return}
  uploading.current=true;onBusy(true);let current=item,saved=0;
  try{for(let index=0;index<files.length;index++){
   const file=files[index];setProgress({done:index,total:files.length,name:file.name});
   if(!file.size||file.size>5_000_000){toast.error(file.name+': escolha uma foto de até 5 MB.');continue}
   const form=new FormData();form.set('file',file);form.set('complaintId',current.id);form.set('version',String(current.version));
   const r=await fetch('/api/complaint-photos',{method:'POST',body:form}),data=await r.json() as {complaint?:Complaint;error?:string};
   if(!r.ok||!data.complaint)throw Error(data.error||'Não foi possível enviar a foto.');
   current=data.complaint;saved++;onChange(current);setProgress({done:index+1,total:files.length,name:file.name});
  }}catch(error){toast.error((error as Error).message)}finally{uploading.current=false;setProgress(null);onBusy(false);if(saved)toast.success(saved===1?'Foto salva na reclamação':saved+' fotos salvas na reclamação')}
 }
 return <section className="complaint-photos complaint-photo-workspace"><header><div><h3><Camera size={18}/> Evidências em fotos</h3><p>Registre o problema e o resultado do atendimento.</p></div><span className="complaint-photo-counter">{photos.length} de 10 fotos</span></header>
 {!item.archived&&photos.length<10&&<div className={'complaint-photo-dropzone '+(dragging?'dragging':'')+(disabled?' disabled':'')} onDragOver={e=>{e.preventDefault();if(!disabled)setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(Array.from(e.dataTransfer.files))}}>
  <input ref={input} type="file" multiple hidden accept="image/png,image/jpeg,image/webp" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files)}}/>
  <span className="complaint-upload-symbol"><UploadCloud size={27}/></span><strong>Arraste as fotos para cá</strong><span>ou selecione as imagens do celular ou computador</span><button className="primary" type="button" disabled={disabled} onClick={()=>input.current?.click()}><ImagePlus size={16}/> Selecionar fotos</button><small>JPG, PNG ou WebP · até 5 MB cada · pode escolher várias</small>
 </div>}
 {progress&&<div className="complaint-upload-progress" role="status" aria-live="polite"><LoaderCircle size={18}/><div><strong>Enviando {Math.min(progress.done+1,progress.total)} de {progress.total}</strong><span>{progress.name}</span><progress max={progress.total} value={progress.done}/></div></div>}
 {photos.length?<><div className="complaint-gallery-caption"><strong>Fotos anexadas</strong><small>Clique para ampliar · use a seta para baixar</small></div><ComplaintPhotoGallery photos={photos}/></>:<div className="complaint-photos-empty"><Camera size={22}/><span>As fotos anexadas aparecerão aqui.</span></div>}
 </section>;
}
