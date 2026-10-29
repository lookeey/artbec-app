import type {OilMonitor} from './oil-monitor';
type Entry={plate:string;lastChange:string;odometer:number|null;notes:string};
export function oilChangeLocation(m:Pick<OilMonitor,'plate'|'oilDate'|'oilKm'>,entries:Entry[]):string{
 const plate=(value:string)=>value.replace(/[^a-z0-9]/gi,'').toUpperCase();
 return entries.some(item=>plate(item.plate)===plate(m.plate)&&item.lastChange===m.oilDate&&item.odometer===m.oilKm&&item.notes.split(' · ')[0]==='Trocado no Wellington')?'Trocado no Wellington':'';
}
