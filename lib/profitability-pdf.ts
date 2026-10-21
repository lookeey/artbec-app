import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage,type RGB} from 'pdf-lib';
import {artbecLogoBase64} from './artbec-logo.ts';
import type {getProfitability} from './profitability';

export type ProfitabilityReport=Awaited<ReturnType<typeof getProfitability>>;
const navy=rgb(.035,.16,.30),teal=rgb(.02,.55,.59),ink=rgb(.12,.22,.32),muted=rgb(.40,.48,.55),pale=rgb(.94,.97,.99),white=rgb(1,1,1),green=rgb(.03,.43,.32),red=rgb(.75,.18,.23);
const clean=(value:string)=>value.replace(/[\u2010-\u2015]/g,'-').replace(/[^\u0020-\u00ff\n]/g,' ');
const money=(value:number)=>`R$ ${(value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const percent=(value:number|null)=>value===null?'-':`${value.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const minutes=(value:number|null)=>value===null?'Sem horário':`${value.toLocaleString('pt-BR',{maximumFractionDigits:1})} min`;
function wrap(value:string,font:PDFFont,size:number,width:number){
 const lines:string[]=[];let line='';
 for(const word of clean(value).split(/\s+/).filter(Boolean)){
  if(font.widthOfTextAtSize(`${line} ${word}`.trim(),size)>width&&line){lines.push(line);line=''}
  for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line=''}line+=char}
  line+=' ';
 }
 if(line.trim())lines.push(line.trim());return lines.length?lines:['-'];
}

export async function renderProfitabilityPdf(report:ProfitabilityReport,technicianId='all',query='',now=new Date()){
 const technicians=report.technicians.filter(person=>technicianId==='all'||person.technicianId===technicianId).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 if(technicianId!=='all'&&!technicians.length)throw new Error('Colaborador não encontrado neste período.');
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const logo=await pdf.embedPng(Uint8Array.from(atob(artbecLogoBase64),char=>char.charCodeAt(0)));
 const W=842,H=595,M=36,C=W-2*M,period=new Date(`${report.period}-02T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 const issued=now.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 pdf.setTitle(`Artbec - Rentabilidade - ${period}`);pdf.setAuthor('Artbec Piscinas');pdf.setCreationDate(now);
 let page:PDFPage,y=0;
 const text=(value:string,x:number,top:number,size=10,font=regular,color:RGB=ink)=>page.drawText(clean(value),{x,y:H-top-size,size,font,color});
 const box=(x:number,top:number,width:number,height:number,color:RGB)=>page.drawRectangle({x,y:H-top-height,width,height,color});
 const addPage=(subtitle:string)=>{
  page=pdf.addPage([W,H]);box(0,0,W,91,navy);box(0,91,W,4,teal);
  page.drawCircle({x:M+22,y:H-42,size:25,color:white});const dims=logo.scaleToFit(41,41);page.drawImage(logo,{x:M+22-dims.width/2,y:H-42-dims.height/2,...dims});
  text('Artbec',M+57,22,23,bold,white);text('P I S C I N A S',M+59,51,8,regular,white);
  text('RELATÓRIO DE RENTABILIDADE',350,24,17,bold,white);text(wrap(`${period}  |  ${subtitle}`,regular,9,W-350-M)[0],350,52,9,regular,white);y=115;
 };
 const ensure=(height:number,subtitle='Continuação')=>{if(y+height>H-48)addPage(subtitle)};
 const heading=(title:string)=>{const lines=wrap(title,bold,15,C);ensure(lines.length*19+12);for(const line of lines){text(line,M,y,15,bold,navy);y+=19}y+=9};
 const paragraph=(value:string)=>{for(const line of wrap(value,regular,10,C)){ensure(15,'Critérios do relatório');text(line,M,y,10);y+=15}y+=10};
 const table=(labels:string[],weights:number[],rows:string[][],right:number[]=[],subtitle='Detalhamento')=>{
  const total=weights.reduce((sum,width)=>sum+width,0),widths=weights.map(width=>C*width/total);
  const header=()=>{box(M,y,C,25,navy);let x=M;labels.forEach((label,index)=>{text(label,x+8,y+7,9,bold,white);x+=widths[index]});y+=25};
  const firstHeight=rows.length?Math.max(30,...rows[0].map((value,i)=>wrap(value,regular,9,widths[i]-16).length*12+14)):30;
  ensure(25+firstHeight,subtitle);header();
  rows.forEach((row,index)=>{
   const cells=row.map((value,i)=>wrap(value,regular,9,widths[i]-16)),height=Math.max(1,...cells.map(lines=>lines.length));let offset=0;
   while(offset<height){if(offset===0&&height*12+14<=H-200&&y+Math.max(30,height*12+14)>H-48){addPage(subtitle);header()}let capacity=Math.floor((H-48-y-14)/12);if(capacity<1){addPage(subtitle);header();capacity=Math.floor((H-48-y-14)/12)}const count=Math.min(height-offset,capacity),rowHeight=Math.max(30,count*12+14);if(index%2===0)box(M,y,C,rowHeight,pale);let x=M;cells.forEach((lines,i)=>{for(let j=offset;j<Math.min(lines.length,offset+count);j++){const line=lines[j];text(line,right.includes(i)?x+widths[i]-8-regular.widthOfTextAtSize(line,9):x+8,y+7+(j-offset)*12,9)}x+=widths[i]});y+=rowHeight;offset+=count;if(offset<height){addPage(subtitle);header()}}
  });y+=20;
 };
 const summary=technicianId==='all'?report.summary:technicians[0];
 addPage(technicianId==='all'?'Visão da equipe':technicians[0].name);
 heading('Resultado do período');
 const kpis=[['Receita atribuída',money(summary.revenue)],['Custo direto',money(summary.directCost)],['Resultado parcial',money(summary.profit)],['Margem estimada',percent(summary.margin)]];
 kpis.forEach(([label,value],index)=>{const x=M+index*(C/4+3);box(x,y,C/4-9,68,pale);box(x,y,3,68,index===2?(summary.profit>=0?green:red):teal);text(label,x+14,y+12,9,regular,muted);text(value,x+14,y+32,18,bold,index===2?(summary.profit>=0?green:red):navy)});y+=88;
 text(`${summary.visits} visitas  |  ${technicianId==='all'?report.summary.clients:technicians[0].clients} clientes  |  Emissão: ${issued}`,M,y,9,regular,muted);y+=29;
 paragraph(`Custos diretos a cobrir: ${money(summary.directCost)}. ${summary.profit>=0?'Receita acima dos custos registrados':'Receita faltante para cobrir os custos atuais'}: ${money(Math.abs(summary.profit))}. Não inclui despesas gerais, encargos patronais nem impostos da empresa.`);
 heading('Comparativo de receita e custos');
 table(['Colaborador','Visitas','Receita','Custo direto','Resultado','Margem'],[240,60,130,130,130,80],technicians.map(person=>[person.name,String(person.visits),money(person.revenue),money(person.directCost),money(person.profit),percent(person.margin)]),[1,2,3,4,5],'Comparativo da equipe');
 if(!technicians.length)paragraph('Nenhum atendimento encontrado nesta competência. Sincronize as tarefas do Auvo para preencher a análise.');
 for(const person of technicians){
  addPage('Análise por colaborador');heading(person.name);
  text(`${person.clients} clientes | ${person.visits} visitas | ${person.daysWorked} dias com atendimento | Média: ${minutes(person.averageMinutes)}`,M,y,10,regular,muted);y+=27;
  table(['Composição do custo','Valor','Folha e descontos','Valor'],[230,140,260,140],[
   ['Folha bruta ajustada',money(person.payrollCost),'Salário base',money(person.baseSalary)],
   ['Gasolina',money(person.fuelCost),'Periculosidade',money(person.hazardPay)],
   ['Óleo',money(person.oilCost),'Horas extras + bônus',money(person.overtime+person.bonus)],
   ['Manutenção',money(person.maintenanceCost),'Faltas + INSS',money(person.absences+person.inss)],
   ['Produtos utilizados',money(person.productCost),'Empréstimo + multas',money(person.loan+person.fines)],
   ['Custo direto total',money(person.directCost),'Adiantamentos',money(person.advance+person.advance15)],
   ['Custo por visita',money(person.costPerVisit),'Saldo da folha',money(person.remainingPay)],
  ],[1,3],person.name);
  paragraph(`Horas em atendimento: ${person.serviceHours}h | Horas disponíveis: ${person.availableHours}h | Ocupação: ${percent(person.utilization)} | Cobertura dos horários: ${percent(person.timingCoverage)}. ${person.payrollMatched?'Folha vinculada.':'Folha não localizada; custo incompleto.'}`);
  paragraph(`Custo por cliente: ${money(person.costPerClient)} | Resultado parcial por cliente: ${person.clients?money(Math.round(person.profit/person.clients)):'Sem clientes'} | Receita por hora registrada: ${person.totalMinutes?money(person.revenuePerHour):'Sem horários'} | Custo por hora registrada: ${person.costPerRecordedHour===null?'Sem horários':money(person.costPerRecordedHour)}. Indicadores por hora dividem os valores atribuídos pelas horas de chegada e saída registradas no Auvo; horários incompletos limitam a comparação.`);
  ensure(110,'Clientes e piscinas atendidos');heading('Clientes e piscinas atendidos');
  const rows=person.customers.filter(customer=>`${customer.name} ${person.name}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  if(query)paragraph(`Busca de clientes: ${query}. Os totais do colaborador incluem toda a carteira; a busca filtra somente o detalhamento abaixo.`);
  table(['Cliente / piscina','Visitas','Tempo médio','Receita','Custo estimado','Resultado'],[250,55,85,125,130,125],rows.map(customer=>[customer.name,String(customer.visits),minutes(customer.averageMinutes),customer.revenueMatched||customer.productRevenue?money(customer.revenue):'Não vinculada',money(customer.allocatedCost),customer.revenueMatched||customer.productRevenue?money(customer.profit):'Não apurado']),[1,2,3,4,5],`${person.name} - Clientes`);
  if(!rows.length)paragraph('Nenhum cliente encontrado com os filtros selecionados.');
 }
 addPage('Critérios e qualidade dos dados');heading('Como interpretar o resultado');
 paragraph('Resultado parcial = receita atribuída menos custos diretos identificados. Este relatório apresenta uma estimativa operacional; não representa o lucro líquido contábil. Adiantamentos e descontos da folha são apresentados separadamente do custo da equipe.');
 paragraph(report.methodology);
 heading('Qualidade dos dados da operação');
 paragraph(`Horários completos: ${percent(report.quality.timingCoverage)}. Clientes com mensalidade vinculada: ${percent(report.quality.revenueCoverage)} (${report.quality.matchedClients} de ${report.quality.totalClients}).`);
 if(report.quality.unmatchedPayroll.length)paragraph(`Folhas não localizadas: ${report.quality.unmatchedPayroll.join(', ')}.`);
 if(report.quality.missingProductCosts)paragraph(`${report.quality.missingProductCosts} item(ns) sem custo de compra identificado. O resultado pode estar acima do real.`);
 if(report.quality.unattributedProductRevenue)paragraph(`Vendas de produtos sem técnico vinculado: ${money(report.quality.unattributedProductRevenue)}; não incluídas no resultado por colaborador.`);
 if(report.quality.shortVisits)paragraph(`${report.quality.shortVisits} visitas com duração de até 5 minutos precisam de conferência.`);
 pdf.getPages().forEach((p,index)=>{page=p;box(M,H-32,C,1,pale);text('ARTBEC PISCINAS  |  Uso interno  |  Valores em reais',M,H-24,8,regular,muted);text(`${index+1} / ${pdf.getPageCount()}`,W-M-45,H-24,8,regular,muted)});
 return pdf.save();
}
