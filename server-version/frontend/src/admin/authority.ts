import {SYSTEM_HOME,isSystemLoginTarget} from './systemWorkspace'
import {isTrainingAdminPath} from './trainingPages'
import type { User } from '../types'
import { internalReturnTo } from '../components/app-shell/access'
export type AdminEntry = 'TRAINING' | 'SURVEY' | 'HUISCHOOL' | 'HUITEACHER'
export const entryLabels: Record<AdminEntry,string> = { TRAINING:'Training 培训管理', SURVEY:'Survey 研究管理', HUISCHOOL:'校园心理健康管理', HUITEACHER:'教师发展管理' }
export const entryPaths: Record<AdminEntry,string> = {TRAINING:'/admin/training',SURVEY:'/admin/survey-researchers',HUISCHOOL:'/admin/huischool',HUITEACHER:'/admin/huiteacher'}
export const hasAdminEntry = (user: User | null, entry: AdminEntry) => Boolean(user?.platformRole==='STANDARD'&&user.entryGrants?.some(g=>g.entry===entry))
export const businessRoleLabel = (user: User) => ({STUDENT:'学员',TEACHER:'培训师',PARENT:'家长',ADMIN:'历史管理员'})[user.businessRole??user.role]
export function adminReturnTo(user: User, raw: string | null) {
  const target = internalReturnTo(raw), path = target?.split(/[?#]/)[0]
  if(user.platformRole==='SYSTEM_ADMIN'&&isSystemLoginTarget(target))return target!
  if (path && ((path==='/admin/survey-system' && user.platformRole==='SYSTEM_ADMIN')
    || (path==='/admin/permissions' && user.platformRole==='SYSTEM_ADMIN')
    || (path==='/admin/reporting-content' && user.platformRole==='SYSTEM_ADMIN')
    || (path==='/admin/survey-researchers' && user.platformRole!=='SYSTEM_ADMIN' && hasAdminEntry(user,'SURVEY'))
    || ((path==='/users'||isTrainingAdminPath(path)) && hasAdminEntry(user,'TRAINING'))
    || (path==='/admin/huischool' && hasAdminEntry(user,'HUISCHOOL'))
    || (path==='/admin/huiteacher' && hasAdminEntry(user,'HUITEACHER'))
    || (path==='/admin/education-products' && (hasAdminEntry(user,'HUISCHOOL')||hasAdminEntry(user,'HUITEACHER'))))) return target!
  return user.platformRole==='SYSTEM_ADMIN'?SYSTEM_HOME:'/admin/entrances'
}
