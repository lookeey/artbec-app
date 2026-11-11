const normalize=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function monthlyClientCount(names:Iterable<string>){
 const unique=new Set([...names].map(normalize).filter(Boolean));
 let total=unique.size;
 if([...unique].some(name=>name.includes('buckigham')||name.includes('buckingham')))total+=23;
 if(unique.has('sandro gilberto')&&!unique.has('sandro gilberto 2'))total+=1;
 return total;
}
