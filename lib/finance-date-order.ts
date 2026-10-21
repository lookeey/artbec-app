type DatedRecord={id:string;date:string;client:string};
function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const parsed=new Date(value+'T12:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:''}
export function financeDueDay(value:string){const date=validDate(value);return date?String(Number(date.slice(8,10))):'none'}
export function compareFinanceDueDate(a:DatedRecord,b:DatedRecord){return (validDate(a.date)||'9999-99-99').localeCompare(validDate(b.date)||'9999-99-99')||a.client.localeCompare(b.client,'pt-BR')||a.id.localeCompare(b.id)}
