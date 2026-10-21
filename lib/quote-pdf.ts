import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage,type PDFImage} from 'pdf-lib';
import {artbecLogoBase64} from './artbec-logo.ts';
import {quoteTotal,type Quote} from './quotes.ts';
const navy=rgb(.015,.065,.22),blue=rgb(.015,.20,.85),cyan=rgb(0,.73,.88),ink=rgb(.04,.10,.21),muted=rgb(.38,.45,.55),pale=rgb(.95,.97,1),line=rgb(.82,.88,.96),white=rgb(1,1,1);
const clean=(s:string)=>s.replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\u0020-\u00ff\n]/g,' ');
const money=(n:number)=>'R$ '+(n/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=(s:string)=>s?s.split('-').reverse().join('/'):'A confirmar';
function wrap(value:string,font:PDFFont,size:number,width:number){
 const result:string[]=[];for(const paragraph of clean(value).split(String.fromCharCode(10))){let row='';for(const token of paragraph.split(/\s+/).filter(Boolean)){
 let word=token;while(font.widthOfTextAtSize(word,size)>width){let end=1;while(end<word.length&&font.widthOfTextAtSize(word.slice(0,end+1),size)<=width)end++;if(row){result.push(row);row=''}result.push(word.slice(0,end));word=word.slice(end)}
 const next=row?row+' '+word:word;if(font.widthOfTextAtSize(next,size)>width&&row){result.push(row);row=word}else row=next;
 }result.push(row||' ')}return result;
}
export async function renderQuotePdf(quote:Quote,images=new Map<string,Uint8Array>()){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),logo=await pdf.embedPng(Uint8Array.from(atob(artbecLogoBase64),c=>c.charCodeAt(0)));
 const W=595,H=842,M=24,C=W-2*M,BOTTOM=80;
 const photos=new Map<string,PDFImage>();for(const [key,bytes] of images){try{photos.set(key,key.endsWith('.png')?await pdf.embedPng(bytes):await pdf.embedJpg(bytes))}catch{/* Damaged photos must not prevent downloading. */}}
 let page!:PDFPage,y=0;
 const text=(s:string,x:number,top:number,size=10,font=regular,color=ink)=>page.drawText(clean(s),{x,y:top-size,size,font,color});
 const center=(s:string,x:number,top:number,width:number,size=10,font=bold,color=ink)=>text(s,x+(width-font.widthOfTextAtSize(clean(s),size))/2,top,size,font,color);
 const box=(x:number,top:number,width:number,height:number,color=white)=>page.drawRectangle({x,y:top-height,width,height,color,borderColor:line,borderWidth:.7});
 const header=()=>{
 page=pdf.addPage([W,H]);page.drawRectangle({x:263,y:H-118,width:W-263,height:118,color:navy});
 page.drawSvgPath('M 0 0 L 28 0 L 0 118 L -28 118 Z',{x:263,y:H,color:blue});
 const d=logo.scaleToFit(65,82);page.drawImage(logo,{x:M+2,y:H-20-d.height,width:d.width,height:d.height});
 text('Artbec',M+79,H-29,37,bold,navy);center('P I S C I N A S',M+78,H-73,149,11,bold,blue);
 center('PROPOSTA DE',286,H-27,285,15,bold,white);center('PRESTAÇÃO DE SERVIÇOS',286,H-48,285,17,bold,white);
 page.drawLine({start:{x:287,y:H-81},end:{x:W-M,y:H-81},color:cyan,thickness:1});
 center('Tratamento e Controle de Piscinas',285,H-88,286,11,bold,cyan);y=H-135;
 };
 const ensure=(height:number)=>{if(y-height<BOTTOM)header()};
 const section=(label:string)=>{ensure(42);box(M,y,C,29,navy);center(label.toUpperCase(),M,y-8,C,12,bold,white);y-=42};
 const paragraph=(value:string,size=10)=>{for(const row of wrap(value,regular,size,C-28)){ensure(size+7);text(row,M+14,y,size);y-=size+6}y-=9};
 header();
 const fields=[{label:quote.recipientType==='lead'?'LEAD / PROSPECT':'CLIENTE',value:quote.clientName},{label:'ENDEREÇO',value:quote.clientAddress||'Endereço a confirmar'},{label:'DATA',value:date(quote.issuedAt)}];
 const fw=C/3,fieldRows=fields.map(f=>wrap(f.value,bold,10,fw-24)),fh=Math.max(75,...fieldRows.map(r=>r.length*14+37));
 box(M,y,C,fh);fields.forEach((f,i)=>{const x=M+i*fw;if(i)page.drawLine({start:{x,y:y-12},end:{x,y:y-fh+12},color:blue,thickness:.7});center(f.label,x,y-13,fw,10,bold,blue);fieldRows[i].forEach((row,j)=>center(row,x,y-35-j*14,fw,10,bold))});y-=fh+13;
 const contact=[quote.leadPhone,quote.leadEmail].filter(Boolean).join(' | ');if(contact)paragraph(contact,9);
 center('Validade: '+date(quote.validUntil)+'  |  Proposta #'+quote.id.slice(-8).toUpperCase(),M,y,C,8,regular,muted);y-=25;
 section('1. Objeto da proposta');
 const object=wrap(quote.title+(quote.objectDescription?.trim()?String.fromCharCode(10,10)+quote.objectDescription:''),regular,11,C-28);
 if(object.length*17<=150){const h=Math.max(54,object.length*17+36);ensure(h+10);box(M,y,C,h);object.forEach((row,i)=>text(row,M+14,y-18-i*17,11));y-=h+15}else{paragraph(quote.title,12);if(quote.objectDescription)paragraph(quote.objectDescription)}
 const left=306,gap=14,right=C-left-gap,total=money(quoteTotal(quote.items));
 const heights=quote.items.map(item=>Math.max(49,wrap(item.description,bold,10,left-51).length*14+34));
 const compact=!quote.items.some(i=>i.imageKey&&photos.has(i.imageKey))&&heights.reduce((a,b)=>a+b,0)+40<=y-BOTTOM-35&&heights.reduce((a,b)=>a+b,0)<=350;
 const investment=(x:number,top:number,width:number)=>{
 box(x,top,width,183,navy);center('INVESTIMENTO',x,top-17,width,13,bold,white);box(x+9,top-48,width-18,125,pale);
 center('VALOR DA PROPOSTA',x+9,top-66,width-18,9,bold,blue);let size=27;while(bold.widthOfTextAtSize(total,size)>width-32)size--;
 center(total,x+9,top-97,width-18,size,bold,navy);center('Valor total',x+9,top-144,width-18,10,bold,blue);
 };
 if(compact){ensure(Math.max(183,heights.reduce((a,b)=>a+b,0)+37)+15);const top=y;investment(M+left+gap,top,right);box(M,top,left,32,navy);center('ITENS E SERVIÇOS INCLUSOS',M,top-10,left,11,bold,white);y-=32;
 quote.items.forEach((item,i)=>{const h=heights[i];box(M,y,left,h,i%2?pale:white);page.drawCircle({x:M+14,y:y-20,size:7,color:rgb(.02,.65,.17)});text('v',M+11,y-14,10,bold,white);const rows=wrap(item.description,bold,10,left-51);rows.forEach((row,j)=>text(row,M+29,y-10-j*14,10,bold));text(item.quantity+' x '+money(item.unitCents)+' = '+money(Math.round(item.quantity*item.unitCents)),M+29,y-h+20,8,regular,muted);y-=h});y=Math.min(y,top-183)-16;
 }else{
 section('2. Itens e serviços inclusos');quote.items.forEach((item,i)=>{
 const photo=item.imageKey?photos.get(item.imageKey):undefined,tx=M+(photo?91:32),tw=C-(photo?108:49),rows=wrap(item.description,bold,10,tw);
 let offset=0;while(offset<rows.length){ensure(85);const count=Math.max(1,Math.min(rows.length-offset,Math.floor((y-BOTTOM-43)/14))),h=Math.max(photo&&offset===0?85:50,count*14+40);ensure(h);box(M,y,C,h,i%2?pale:white);if(photo&&offset===0){const d=photo.scaleToFit(64,64);page.drawImage(photo,{x:M+13+(64-d.width)/2,y:y-12-d.height,width:d.width,height:d.height})}rows.slice(offset,offset+count).forEach((row,j)=>text(row,tx,y-13-j*14,10,bold));if(offset+count>=rows.length)text(item.quantity+' x '+money(item.unitCents)+'  |  Total: '+money(Math.round(item.quantity*item.unitCents)),tx,y-h+21,9,regular,blue);offset+=count;y-=h+8}
 });ensure(198);investment(M,y,C);y-=198;
 }
 if(quote.notes.trim()){section('Observações técnicas');paragraph(quote.notes)}if(quote.terms.trim()){section('Pagamento e condições');paragraph(quote.terms)}

 const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;center('Qualidade, segurança e excelência no tratamento das piscinas.',M,67,C,8,bold,blue);p.drawLine({start:{x:M,y:53},end:{x:W-M,y:53},color:line,thickness:.7});center('Artbec Piscinas Ltda | CNPJ 54.383.380/0001-10',M,44,C,8,bold,navy);center('artbecpiscinas@gmail.com',M,31,C,8,regular,muted);text((i+1)+'/'+pages.length,W-M-22,31,8,regular,muted)});
 return pdf.save();
}
