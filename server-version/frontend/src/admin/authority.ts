import type { User } from '../types'
import { internalReturnTo } from '../components/app-shell/access'
export type AdminEntry = 'TRAINING' | 'SURVEY' | 'HUISCHOOL' | 'HUITEACHER'
export const entryLabels: Record<AdminEntry,string> = { TRAINING:'Training 培训管理', SURVEY:'Survey 研究管理', HUISCHOOL:'校园心理健康管理', HUITEACHER:'教师发展管理' }
export const hasAdminEntry = (user: User | null, entry: AdminEntry) => Boolean(user?.entryGrants?.some(g=>g.entry===entry))
export function adminReturnTo(user: User, raw: string | null) {
  const target = internalReturnTo(raw), path = target?.split(/[?#]/)[0]
  if (path && ((path==='/admin/permissions' && user.platformRole==='SYSTEM_ADMIN')
    || (path==='/admin/survey-researchers' && hasAdminEntry(user,'SURVEY'))
    || (['/users','/admin/training'].includes(path) && hasAdminEntry(user,'TRAINING'))
    || (path==='/admin/education-products' && (hasAdminEntry(user,'HUISCHOOL')||hasAdminEntry(user,'HUITEACHER'))))) return target!
  return user.platformRole==='SYSTEM_ADMIN'?'/admin/permissions':'/admin/entrances'
}
