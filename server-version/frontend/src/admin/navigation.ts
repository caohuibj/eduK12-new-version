import type {User} from '../types'
import type {NavigationItem} from '../components/app-shell/navigation'
import {businessRoleLabel,entryLabels,entryPaths,hasAdminEntry,type AdminEntry} from './authority'

export const isAdminWorkspacePath=(path:string)=>path.startsWith('/admin/')||['/users','/teacher-codes','/parent-accounts','/parent-tool-policies'].includes(path)
export function adminNavigation(user:User|null):NavigationItem[]{
  if(!user)return []
  const items:NavigationItem[]=[{path:'/admin/entrances',label:'管理入口',section:'system'}]
  if(user.platformRole==='SYSTEM_ADMIN')items.push({path:'/admin/permissions',label:'系统治理与入口授权',section:'system'},
    {path:'/admin/reporting-content',label:'报告方案与内容审核',section:'system'})
  for(const entry of Object.keys(entryPaths) as AdminEntry[])
    if(hasAdminEntry(user,entry))items.push({path:entryPaths[entry],label:entryLabels[entry],section:'system'})
  if(hasAdminEntry(user,'TRAINING'))items.push({path:'/users',label:'培训账号审核',section:'system'},{path:'/teacher-codes',label:'培训师注册码',section:'system'})
  const businessRole=user.businessRole??user.role
  if(businessRole==='STUDENT'||businessRole==='TEACHER'||businessRole==='PARENT')items.push({path:(businessRole==='STUDENT'?'/student':businessRole==='PARENT'?'/parent':'/dashboard')+'?workspace=business',label:businessRoleLabel(user)+'业务工作台',section:'account'})
  items.push({path:businessRole==='STUDENT'?'/student/profile':businessRole==='PARENT'?'/parent/profile':'/profile',label:'账户设置',section:'account'})
  return items
}
export function managementIdentityLabel(user:User):string{
  const authorities=[...(user.platformRole==='SYSTEM_ADMIN'?['系统管理员']:[]),...(user.entryGrants??[]).map(g=>entryLabels[g.entry])]
  return (authorities.length?authorities.join('、'):'无管理授权')+' · 业务身份：'+businessRoleLabel(user)
}
