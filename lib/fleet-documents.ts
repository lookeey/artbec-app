export const fleetDocumentKey=(key:string)=>/^fleet-documents\/bike-[a-z0-9][a-z0-9-]{0,199}\/[0-9a-f-]{36}\.pdf$/i.test(key);
export const fleetDocumentFor=(key:string,id:string)=>fleetDocumentKey(key)&&key.startsWith(`fleet-documents/${id}/`);
export const isPdf=(bytes:Uint8Array)=>bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
