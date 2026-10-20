import type {User} from '../types'
export type AccountView='BUSINESS'|'MANAGEMENT'
const key='eduk12:account-view'
// A tab-local display choice, never an authorization credential. Explicit
// participant deep links select business; management links select management.
export function accountView(pathname=window.location.pathname,search=window.location.search):AccountView{
  const workspace=new URLSearchParams(search).get('workspace')
  const explicit:AccountView|undefined=pathname.startsWith('/admin/')||['/users','/teacher-codes','/parent-accounts','/parent-tool-policies'].includes(pathname)||workspace==='training'
    ?'MANAGEMENT':workspace==='business'||/^\/(student|teacher|parent|relational)(?:\/|$)/.test(pathname)?'BUSINESS':undefined
  try{
    if(explicit&&sessionStorage.getItem(key)!==explicit)sessionStorage.setItem(key,explicit)
    return explicit??(sessionStorage.getItem(key)==='MANAGEMENT'?'MANAGEMENT':'BUSINESS')
  }catch{return explicit??'BUSINESS'}
}
export function userForAccountView(user:User|null,view:AccountView):User|null{
  if(!user)return null
  if(view==='MANAGEMENT')return user.entryGrants?.some(g=>g.entry==='TRAINING')?{...user,role:'ADMIN'}:user
  const role=user.businessRole??user.role
  return role==='ADMIN'?user:{...user,role}
}
