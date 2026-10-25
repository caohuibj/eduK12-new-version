import {SYSTEM_HOME,SYSTEM_SURVEY_AUDIT} from './systemWorkspace'
import type {User} from '../types'
import type {NavigationItem} from '../components/app-shell/navigation'
import {businessRoleLabel,entryLabels,entryPaths,hasAdminEntry,type AdminEntry} from './authority'

export const isAdminWorkspacePath=(path:string)=>path.startsWith('/admin/')||['/users','/teacher-codes','/parent-accounts','/parent-tool-policies'].includes(path)
export function adminNavigation(user:User|null):NavigationItem[]{
  if(!user)return []
  if(user.platformRole==='SYSTEM_ADMIN')return [{path:SYSTEM_HOME,label:'系统工作台',section:'system'},{path:'/admin/permissions',label:'管理授权',section:'system'},{path:'/admin/scale-library-governance',label:'共享工具治理',section:'system'},{path:'/admin/reporting-content',label:'报告与内容审核',section:'system'},{path:SYSTEM_SURVEY_AUDIT,label:'数据审计',section:'system'}]
  const items:NavigationItem[]=[{path:'/admin/entrances',label:'管理入口',section:'system'}]
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
