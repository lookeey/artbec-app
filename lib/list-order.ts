export function replaceKeepingPosition<T extends {id:string}>(items:T[],updated:T):T[]{
 const index=items.findIndex(item=>item.id===updated.id);
 if(index<0)return [...items,updated];
 return items.map((item,position)=>position===index?updated:item);
}
