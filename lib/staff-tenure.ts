const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function localDate(year:number,month:number,day:number){
 const value=new Date(year,month-1,day);
 return value.getFullYear()===year&&value.getMonth()===month-1&&value.getDate()===day?value:null;
}

export function parseStaffStartDate(value:string):{date:Date;approximate:boolean}|null{
 const input=value.trim();
 let match=input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(match){const date=localDate(Number(match[1]),Number(match[2]),Number(match[3]));return date?{date,approximate:false}:null}
 match=input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(match){const date=localDate(Number(match[3]),Number(match[2]),Number(match[1]));return date?{date,approximate:false}:null}
 const normalized=input.toLocaleLowerCase('pt-BR');
 match=normalized.match(/^(?:(\d{1,2})\s+de\s+)?([a-zçãé]+)\s+de\s+(\d{4})$/);
 if(!match)return null;
 const month=months.indexOf(match[2])+1;
 const date=month?localDate(Number(match[3]),month,Number(match[1]??1)):null;
 return date?{date,approximate:!match[1]}:null;
}

export function staffStartInput(value:string){
 const parsed=parseStaffStartDate(value);
 if(!parsed)return '';
 const date=parsed.date;
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function staffStartLabel(value:string){
 const parsed=parseStaffStartDate(value);
 if(!parsed)return value||'Data de início não informada';
 const label=parsed.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
 return parsed.approximate?label.replace(/^\d+ de /,'Desde '):label;
}

export function staffTenure(value:string,today:Date):string{
 const parsed=parseStaffStartDate(value);
 if(!parsed)return 'Informe a data de início';
 const started=parsed.date;
 const end=new Date(today.getFullYear(),today.getMonth(),today.getDate());
 if(started>end)return 'Início no futuro';
 let years=end.getFullYear()-started.getFullYear();
 let monthsElapsed=end.getMonth()-started.getMonth();
 if(end.getDate()<started.getDate())monthsElapsed--;
 if(monthsElapsed<0){years--;monthsElapsed+=12}
 const parts=[];
 if(years)parts.push(`${years} ${years===1?'ano':'anos'}`);
 if(monthsElapsed)parts.push(`${monthsElapsed} ${monthsElapsed===1?'mês':'meses'}`);
 if(!parts.length){const days=Math.floor((Date.UTC(end.getFullYear(),end.getMonth(),end.getDate())-Date.UTC(started.getFullYear(),started.getMonth(),started.getDate()))/86400000);parts.push(`${days} ${days===1?'dia':'dias'}`)}
 return `${parsed.approximate?'Cerca de ':''}${parts.join(' e ')}`;
}
