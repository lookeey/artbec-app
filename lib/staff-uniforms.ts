export type Uniform={item:string;size:string;received:string};
export const uniformSizes=[{item:'Bota',field:'bootSize',placeholder:'Ex.: 40'},{item:'Calça',field:'pantsSize',placeholder:'Ex.: 42 ou M'},{item:'Camisa',field:'shirtSize',placeholder:'Ex.: M, G ou GG'}] as const;
const normalized=(value:string)=>value.trim().toLocaleLowerCase('pt-BR');
export function uniformSize(uniforms:Uniform[],item:string){return uniforms.find(u=>normalized(u.item)===normalized(item))?.size??''}
export function updateUniformSizes(uniforms:Uniform[],values:Record<string,string>):Uniform[]{
 const result=uniforms.map(u=>({...u}));
 for(const definition of uniformSizes){const size=(values[definition.field]??'').trim(),existing=result.find(u=>normalized(u.item)===normalized(definition.item));if(existing)existing.size=size;else if(size)result.push({item:definition.item,size,received:''})}
 return result;
}
