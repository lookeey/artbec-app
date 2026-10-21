export function businessToday(now = new Date()) {
 const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
 const value = (type:string) => parts.find(part => part.type === type)?.value ?? '';
 return `${value('year')}-${value('month')}-${value('day')}`;
}

export function currentPeriod(now = new Date()) {return businessToday(now).slice(0,7)}

export function nextPeriod(period:string) {
 const [year, month] = period.split('-').map(Number);
 return `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}`;
}

export function periodOptions(values:string[], current = currentPeriod()) {
 const valid = values.filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
 const start = [...valid,current].sort()[0];
 const end = [...valid,current].sort().at(-1)!;
 const result:string[] = [];
 for(let period = start; period <= end && result.length < 240; period = nextPeriod(period)) result.push(period);
 return values.includes('sem-data')?[...result.reverse(),'sem-data']:result.reverse();
}

export function moveDueDate(date:string, targetPeriod:string, billingDay?:number) {
 const day = billingDay || Number(date.slice(8,10));
 if(!Number.isInteger(day) || day < 1 || day > 31) return '';
 const [year,month] = targetPeriod.split('-').map(Number);
 const lastDay = new Date(Date.UTC(year,month,0)).getUTCDate();
 return `${targetPeriod}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
