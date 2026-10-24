import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { AdminPermissionError, assertEntryAdmin } from '../modules/admin-permissions/service'
import { ADMIN_STEP_UP_SECONDS, validAdminProof, type AdminSessionProof } from '../modules/admin-permissions/proof'

export type TrainingTeacherAction = 'EXTEND' | 'FREEZE' | 'UNFREEZE' | 'RESET_PASSWORD'
export type TrainingTeacherCommand = {
  actorUserId: string; targetUserId: string; actorSession: AdminSessionProof
  expectedUpdatedAt: string; action: TrainingTeacherAction; months?: number; passwordHash?: string
}
type Row = {
  id:string;username:string;role:string;platformRole:string;accountDomain:string
  isActive:boolean;isFrozen:boolean;expiresAt:Date|null;updatedAt:Date;tokenVersion:number
}
function reject(status:number, message:string):never { throw new AdminPermissionError(status,message) }

/** Keep calendar months without rolling January 31 into March. */
export function extendTrainingExpiry(expiresAt:Date, months:number, now=new Date()) {
  if(!Number.isInteger(months)||months<1||months>120) return reject(400,'延期月数需为 1–120 的整数')
  const next=new Date(Math.max(expiresAt.getTime(),now.getTime())),day=next.getUTCDate()
  next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+months)
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()
  next.setUTCDate(Math.min(day,last));return next
}

async function lockAndAuthorize(tx:Prisma.TransactionClient,input:TrainingTeacherCommand) {
  if(!validAdminProof(input.actorSession,ADMIN_STEP_UP_SECONDS)) reject(403,'请重新完成管理员双因素验证')
  const ids=[...new Set([input.actorUserId,input.targetUserId])].sort()
  const rows=await tx.$queryRaw<Row[]>`
    SELECT "id","username","role"::text AS "role","platform_role"::text AS "platformRole",
      "account_domain" AS "accountDomain","is_active" AS "isActive","is_frozen" AS "isFrozen",
      "expires_at" AS "expiresAt","updated_at" AS "updatedAt","token_version" AS "tokenVersion"
    FROM "users" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  const actor=rows.find(row=>row.id===input.actorUserId)
  if(!actor||actor.tokenVersion!==input.actorSession.tokenVersion) reject(403,'操作者会话已失效，请重新登录')
  await assertEntryAdmin(tx,input.actorUserId,'TRAINING')
  if(!validAdminProof(input.actorSession,ADMIN_STEP_UP_SECONDS)) reject(403,'请重新完成管理员双因素验证')
  const target=rows.find(row=>row.id===input.targetUserId)
  if(!target||!['LEGACY','TRAINING'].includes(target.accountDomain)||target.role!=='TEACHER') reject(404,'培训师账号不存在')
  if(target.id===input.actorUserId||target.platformRole!=='STANDARD') reject(403,'管理身份须由系统管理员处理')
  const protectedRows=await tx.$queryRaw<Array<{protected:boolean}>>`
    SELECT EXISTS(SELECT 1 FROM "admin_entry_grants" WHERE "user_id"=${target.id} AND "revoked_at" IS NULL)
      OR EXISTS(SELECT 1 FROM "organization_memberships" WHERE "user_id"=${target.id} AND "org_role"='ORG_ADMIN'
        AND "valid_from"<=clock_timestamp() AND ("valid_until" IS NULL OR "valid_until">clock_timestamp())) AS "protected"`
  if(protectedRows[0]?.protected) reject(403,'该培训师具有入口或组织管理身份，请由系统管理员处理')
  if(!target.isActive) reject(409,'账号已被禁用，请由系统管理员处理')
  if(target.updatedAt.getTime()!==new Date(input.expectedUpdatedAt).getTime()) reject(409,'账号状态已改变，请刷新列表后重试')
  return target
}

/** Reject unauthorized requests before generating/hashing a temporary secret. */
export async function trainingTeacherManagementPreflight(input:TrainingTeacherCommand) {
  await prisma.$transaction(async tx=>{await lockAndAuthorize(tx,input)})
}

/** Current entry authority, account protection, stale-write checks and audit
 * share one transaction. This never grants roles, activates disabled accounts,
 * approves registration, changes course data or unfreezes implicitly. */
export async function manageTrainingTeacher(input:TrainingTeacherCommand) {
  return prisma.$transaction(async tx=>{
    const target=await lockAndAuthorize(tx,input)
    let data:Prisma.UserUpdateInput
    switch(input.action) {
      case 'EXTEND':
        if(!target.expiresAt) return reject(409,'账号永久有效，无需延期')
        data={expiresAt:extendTrainingExpiry(target.expiresAt,input.months??12)};break
      case 'FREEZE':
      case 'UNFREEZE': {
        const frozen=input.action==='FREEZE'
        if(target.isFrozen===frozen) return {id:target.id,username:target.username,changed:false}
        data={isFrozen:frozen,tokenVersion:{increment:1}};break
      }
      case 'RESET_PASSWORD':
        if(!input.passwordHash) return reject(400,'缺少密码重置参数')
        data={passwordHash:input.passwordHash,mustChangePassword:true,tokenVersion:{increment:1}};break
      default:return reject(400,'不支持的培训师管理操作')
    }
    const updated=await tx.user.update({where:{id:target.id},data,select:{id:true,username:true,isFrozen:true,expiresAt:true,mustChangePassword:true,updatedAt:true}})
    await tx.adminAuthorizationAudit.create({data:{id:randomUUID(),actorUserId:input.actorUserId,targetUserId:target.id,entry:'TRAINING',action:`TRAINING_TEACHER_${input.action}`,reason:input.action==='EXTEND'?`延长 ${input.months??12} 个月`:'Training 培训师账号管理'}})
    return {...updated,changed:true}
  })
}
