import { standardAssignmentReturnTo } from '../../admin/standardAssignmentTarget'

/** Exact presentation whitelist. Authentication and return authorization stay with the caller. */
export function educationEntry(search:string){
 const raw=new URLSearchParams(search).get('returnTo')
 const path=standardAssignmentReturnTo(raw)?.split('?')[0]??raw
 return path==='/admin/huischool'?'School':path==='/admin/huiteacher'?'Teacher':null
}
