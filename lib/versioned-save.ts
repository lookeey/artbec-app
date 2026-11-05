type Versioned={id:string;version:number};

// A tela pode ter sido aberta antes de outro salvamento concluir. Atualizamos
// somente a versão e repetimos uma vez: a alteração recém-informada continua
// sendo aplicada, sem obrigar a pessoa a recarregar a página.
export async function saveWithCurrentVersion<T extends Versioned>(
 item:T,
 save:(item:T)=>Promise<Response>,
 load:()=>Promise<T|undefined>,
):Promise<Response>{
 let response=await save(item);
 if(response.status!==409)return response;
 const current=await load();
 if(!current)return response;
 response=await save({...item,version:current.version});
 return response;
}
