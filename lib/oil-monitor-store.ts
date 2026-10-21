import {database} from './finance-store';
import type {OilMonitor} from './oil-monitor';
export async function getOilMonitors(){const rows=await database().prepare("SELECT data,version FROM operation_changes WHERE entity='oilMonitor' AND deleted=0").all<{data:string;version:number}>();return rows.results.map(r=>({...JSON.parse(r.data),version:r.version}) as OilMonitor)}
