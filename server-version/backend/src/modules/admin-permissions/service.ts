import { GIT_RELEASE_USERNAME } from '../../utils/gitReleaseIdentity'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { ADMIN_STEP_UP_SECONDS, validAdminProof, type AdminSessionProof } from './proof'
import { readEntryOffboarding, retainSurveyWaveHandoffs, type EntryOffboarding } from './offboarding'

export const ADMIN_ENTRIES = ['TRAINING', 'SURVEY', 'HUISCHOOL', 'HUITEACHER'] as const
export type AdminEntry = typeof ADMIN_ENTRIES[number]
export class AdminPermissionError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message) }
}

export async function assertEntryAdmin(db: Prisma.TransactionClient, userId: string, entry: AdminEntry) {
  // Materialization keeps the expiry decision after any row-lock wait.
  const rows = await db.$queryRaw<Array<{ id: string; grantId: string; grantVersion: number }>>`
    WITH locked AS MATERIALIZED (
      SELECT u."id", u."expires_at",g.id AS "grantId",g.version AS "grantVersion" FROM "users" u JOIN "admin_entry_grants" g ON g."user_id"=u."id"
      WHERE u."id"=${userId} AND g."entry"=${entry} AND g."revoked_at" IS NULL
        AND u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password" AND u."platform_role"='STANDARD'
        AND u."account_domain" IN ('LEGACY','TRAINING') LIMIT 1 FOR SHARE OF u,g
    )
    SELECT "id","grantId","grantVersion" FROM locked WHERE "expires_at" IS NULL OR "expires_at">clock_timestamp()
  `
  if (!rows.length) throw new AdminPermissionError(403, '缺少当前入口管理授权')
  return rows[0]
}

type LockedAdminAccount = {
  id: string
  tokenVersion: number
  platformRole: string
  accountDomain: string
  isActive: boolean
  isFrozen: boolean
  expiresAt: Date | null
  mustChangePassword: boolean
}

export async function lockAdminMutation(
  tx: Prisma.TransactionClient,
  input: { actorUserId: string; actorSession: AdminSessionProof },
  targetUserId = input.actorUserId,
): Promise<LockedAdminAccount | undefined> {
  if (!validAdminProof(input.actorSession, ADMIN_STEP_UP_SECONDS))
    throw new AdminPermissionError(403, '授权变更需要最近的管理员双因素验证')
  const ids = [...new Set([input.actorUserId, targetUserId])].sort()
  const locked = await tx.$queryRaw<LockedAdminAccount[]>`
    SELECT "id","token_version" AS "tokenVersion","platform_role"::text AS "platformRole","account_domain" AS "accountDomain",
      "is_active" AS "isActive","is_frozen" AS "isFrozen","expires_at" AS "expiresAt","must_change_password" AS "mustChangePassword"
    FROM "users" WHERE "id" IN (${Prisma.join(ids)}) AND username<>${GIT_RELEASE_USERNAME} ORDER BY "id" FOR UPDATE`
  const actor = locked.find(row => row.id === input.actorUserId)
  if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen
    || (actor.expiresAt && actor.expiresAt <= new Date()) || !['LEGACY', 'TRAINING'].includes(actor.accountDomain)
    || actor.mustChangePassword || actor.tokenVersion !== input.actorSession.tokenVersion
    || !validAdminProof(input.actorSession, ADMIN_STEP_UP_SECONDS))
    throw new AdminPermissionError(403, '操作者会话已失效，请重新登录')
  return locked.find(row => row.id === targetUserId)
}

export async function previewEntryOffboarding(targetUserId:string,entry:AdminEntry,successorId?:string){
  return prisma.$transaction(async tx=>{
    const current=await tx.adminEntryGrant.findUnique({where:{userId_entry:{userId:targetUserId,entry}}})
    if(!current||current.revokedAt)throw new AdminPermissionError(409,'当前入口权限已经撤销，请刷新')
    const {handoffs:_,successor,...preview}=await readEntryOffboarding(tx,{id:current.id,userId:targetUserId,entry,version:current.version},successorId)
    if(successorId&&!successor)throw new AdminPermissionError(409,'接任人须为另一位可操作的同入口管理员')
    return preview
  })
}

// The caller supplies the version it actually reviewed. Retrying a committed
// operation is idempotent; an older command cannot silently undo newer state.
export async function changeEntryGrant(input: {
  actorUserId: string; targetUserId: string; entry: AdminEntry
  active: boolean; expectedVersion: number; reason: string; actorSession: AdminSessionProof; offboarding?:EntryOffboarding
}) {
  return prisma.$transaction(async tx => {
    const target = await lockAdminMutation(tx, input, input.targetUserId)
    if (!target || !['LEGACY', 'TRAINING'].includes(target.accountDomain))
      throw new AdminPermissionError(404, '管理账号不存在或不属于管理身份域')
    if(input.active && (target.platformRole==='SYSTEM_ADMIN'||input.actorUserId===input.targetUserId))
      throw new AdminPermissionError(403,'入口管理角色必须由独立账号承接，禁止自授或与系统角色叠加')
    const current = await tx.adminEntryGrant.findUnique({ where: { userId_entry: { userId: input.targetUserId, entry: input.entry } } })
    const version = current?.version ?? 0
    const active = Boolean(current && !current.revokedAt)
    if (input.expectedVersion !== version) {
      if (version === input.expectedVersion + 1 && active === input.active)
        return { entry: input.entry, active, version, changed: false }
      throw new AdminPermissionError(409, '授权已变化，请刷新后重新操作')
    }
    if (active === input.active) return { entry: input.entry, active, version, changed: false }
    const nextVersion = version + 1
    const withdrawal=input.offboarding
    if(!input.active&&current){
      if(!withdrawal)throw new AdminPermissionError(400,'撤销前请核对影响并选择计划交接或紧急撤销')
      if(withdrawal.mode==='PLANNED'){
        let impact:Awaited<ReturnType<typeof readEntryOffboarding>>
        try{
          impact=await readEntryOffboarding(tx,{id:current.id,userId:input.targetUserId,entry:input.entry,version},withdrawal.successorId,true)
        }catch(error){
          const sqlError=error as {code?:string;meta?:{code?:string}}
          if(sqlError.code==='55P03'||sqlError.meta?.code==='55P03')
            throw new AdminPermissionError(409,'接任权限正在变化，请重新核对交接影响')
          throw error
        }
        if(withdrawal.successorId&&!impact.successor)throw new AdminPermissionError(409,'接任人不再具备同入口操作资格')
        if(impact.digest!==withdrawal.digest)throw new AdminPermissionError(409,'撤销影响或接任权限已变化，请重新核对')
        if(impact.counts.pending)throw new AdminPermissionError(409,'仍有需要重绑或重发的配置，请处理后再完成计划交接')
        if(impact.successor)await retainSurveyWaveHandoffs(tx,input.actorUserId,nextVersion,impact.successor,impact.handoffs)
      }
    }
    if(!validAdminProof(input.actorSession,ADMIN_STEP_UP_SECONDS))
      throw new AdminPermissionError(403,'授权变更需要最近的管理员双因素验证')
    if (current) await tx.adminEntryGrant.update({ where: { id: current.id }, data: {
      version: nextVersion,
      ...(input.active ? { grantedBy: input.actorUserId, grantedAt: new Date(), revokedBy: null, revokedAt: null }
        : { revokedBy: input.actorUserId, revokedAt: new Date() }),
    } })
    else await tx.adminEntryGrant.create({ data: { id: randomUUID(), userId: input.targetUserId, entry: input.entry, grantedBy: input.actorUserId } })
    await tx.user.update({ where: { id: input.targetUserId }, data: { tokenVersion: { increment: 1 } } })
    await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), actorUserId: input.actorUserId,
      targetUserId: input.targetUserId, entry: input.entry, action:input.active?'ENTRY_GRANTED':withdrawal?.mode==='PLANNED'?'ENTRY_REVOKED_PLANNED':'ENTRY_REVOKED_EMERGENCY',
      version: nextVersion, reason: input.reason } })
    return { entry: input.entry, active: input.active, version: nextVersion, changed: true }
  })
}
