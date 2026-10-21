import {businessToday} from './month-rollover.ts';

/** Completed years, calculated in the company's timezone. Missing/invalid dates stay unknown. */
export function staffAge(birthDate:string, now=new Date()):number|null {
 const value=birthDate?.trim()||'';
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
 if(!iso&&!br)return null;
 const [year,month,day]=iso?iso.slice(1).map(Number):[Number(br![3]),Number(br![2]),Number(br![1])];
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<100||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 const [todayYear,todayMonth,todayDay]=businessToday(now).split('-').map(Number);
 const age=todayYear-year-(todayMonth<month||(todayMonth===month&&todayDay<day)?1:0);
 return age<0?null:age;
}
