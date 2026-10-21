import {scopeManagement,scopeOperations} from '@/lib/access-scope';
import {cookies} from 'next/headers';
import Finance from './finance';
import LoginPanel from './login-panel';
import source from '@/data/source.json';
import noteSource from '@/data/notes.json';
import managementSource from '@/data/management.json';
import operationsSource from '@/data/operations.json';
import type {OperationsSource} from './operations-panel';
import type {ManagementSource} from './management-panel';
import {canAccess,sessionUser,SESSION_COOKIE} from '@/lib/auth';

export default async function Home(){
 const store=await cookies(),user=await sessionUser(store.get(SESSION_COOKIE)?.value??null);
 if(!user)return <LoginPanel/>;
 const allowed=(view:string)=>canAccess(user,view),finance={...source,records:source.records.filter(record=>record.kind==='Mensalidade'?['overview','monthly','growth','history'].some(allowed):['overview','services'].some(allowed)),report:allowed('history')?source.report:[]},notes=allowed('notes')?noteSource:{...noteSource,notes:[],periods:[]},rawManagement=managementSource as ManagementSource,management=scopeManagement(rawManagement,allowed),operations=scopeOperations(operationsSource as unknown as OperationsSource,allowed);
 return <Finance initial={finance} initialNotes={notes} initialManagement={management} initialOperations={operations} user={user}/>;
}

