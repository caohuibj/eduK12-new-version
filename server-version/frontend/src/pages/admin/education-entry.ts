/** Exact presentation whitelist. Authentication and return authorization stay with the caller. */
export function educationEntry(search:string){
 const path=new URLSearchParams(search).get('returnTo')
 return path==='/admin/huischool'?'School':path==='/admin/huiteacher'?'Teacher':null
}
