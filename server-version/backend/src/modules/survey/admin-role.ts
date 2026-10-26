import type { Prisma } from '@prisma/client'
import type { RequestHandler } from 'express'
import { forbidden } from '../../utils/response'
import { AdminPermissionError, assertEntryAdmin } from '../admin-permissions/service'

/** Independent role: STANDARD management identity with an explicit SURVEY entry.
 * A system administrator never inherits researcher-management authority. */
export async function assertSurveyManager(db:Prisma.TransactionClient,userId:string){
  await assertEntryAdmin(db,userId,'SURVEY')
  // assertEntryAdmin locks this user/grant and requires STANDARD, a valid
  // account and this exact entry. Its proof lives only in this transaction.
}
export async function assertSurveyLibraryManager(db:Prisma.TransactionClient,userId:string){
  const [row]=await db.$queryRaw<Array<{role:string}>>`SELECT platform_role::text AS role FROM users WHERE id=${userId}
    AND account_domain IN ('LEGACY','TRAINING') AND is_active AND NOT is_frozen AND NOT must_change_password
    AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`
  if(row?.role==='SYSTEM_ADMIN')return
  await assertSurveyManager(db,userId)
}
export const requireSurveyManager:RequestHandler=(req,res,next)=>{
  if(req.user?.platformRole!=='STANDARD'||!req.user.entryGrants?.some(g=>g.entry==='SURVEY'))
    return forbidden(res,'研究者管理与工具分配仅限独立 Survey 管理员')
  next()
}
