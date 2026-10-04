import { Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { assertAlternativeUsableOrgAdmin } from './adminInvariant'
import {
  MembershipRecord,
  OrganizationCapability,
  OrganizationDomainError,
  OrganizationPersona,
  OrganizationRecord,
  OrganizationRole,
} from './types'

type Tx = Prisma.TransactionClient

export interface CommandMeta {
  actorUserId: string
  commandKey: string
}

type ReceiptRow = {
  payloadHash: string
  response: unknown
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    )
  }
  return value
}

function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(payload))).digest('hex')
}

async function findReceipt(
  client: Tx | typeof prisma,
  actorUserId: string,
  organizationId: string | null,
  commandKey: string,
): Promise<ReceiptRow | null> {
  const rows = await client.$queryRaw<ReceiptRow[]>`
    SELECT "payload_hash" AS "payloadHash", "response"
    FROM "organization_command_receipts"
    WHERE "actor_user_id" = ${actorUserId}
      AND COALESCE("organization_id", '') = COALESCE(${organizationId}, '')
      AND "command_key" = ${commandKey}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function appendAudit(tx: Tx, input: {
  organizationId: string | null
  actorUserId: string
  action: string
  targetType: string
  targetId: string | null
  domainEventId: string
  payload: unknown
}): Promise<void> {
  const auditId = randomUUID()
  const payloadJson = JSON.stringify(stableValue(input.payload))
  await tx.$executeRaw`
    INSERT INTO "organization_governance_audits" (
      "id", "organization_id", "actor_user_id", "action", "target_type",
      "target_id", "domain_event_id", "payload"
    ) VALUES (
      ${auditId}, ${input.organizationId}, ${input.actorUserId}, ${input.action},
      ${input.targetType}, ${input.targetId}, ${input.domainEventId}, ${payloadJson}::jsonb
    )
  `
}

export async function executeCommand<T>(input: {
  organizationId: string | null
  meta: CommandMeta
  payload: unknown
  work: (tx: Tx, domainEventId: string) => Promise<T>
}): Promise<T> {
  if (!input.meta.commandKey.trim()) {
    throw new OrganizationDomainError('COMMAND_KEY_REQUIRED', '缺少 commandKey', 400)
  }

  const hash = payloadHash(input.payload)
  const existing = await findReceipt(
    prisma,
    input.meta.actorUserId,
    input.organizationId,
    input.meta.commandKey,
  )
  if (existing) {
    if (existing.payloadHash !== hash) {
      throw new OrganizationDomainError('IDEMPOTENCY_CONFLICT', 'commandKey 已用于不同请求', 409)
    }
    return existing.response as T
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const replay = await findReceipt(
        tx,
        input.meta.actorUserId,
        input.organizationId,
        input.meta.commandKey,
      )
      if (replay) {
        if (replay.payloadHash !== hash) {
          throw new OrganizationDomainError('IDEMPOTENCY_CONFLICT', 'commandKey 已用于不同请求', 409)
        }
        return replay.response as T
      }

      const domainEventId = randomUUID()
      const result = await input.work(tx, domainEventId)
      const receiptId = randomUUID()
      const responseJson = JSON.stringify(result)
      await tx.$executeRaw`
        INSERT INTO "organization_command_receipts" (
          "id", "actor_user_id", "organization_id", "command_key", "payload_hash", "response"
        ) VALUES (
          ${receiptId}, ${input.meta.actorUserId}, ${input.organizationId},
          ${input.meta.commandKey}, ${hash}, ${responseJson}::jsonb
        )
      `
      return result
    })
  } catch (err: any) {
    // A concurrent identical command may win the receipt unique index. The
    // losing transaction is rolled back in full; replay the committed receipt.
    const postgresCode = err?.meta?.code ?? err?.code
    if (postgresCode === '23505' || err?.code === 'P2010') {
      const replay = await findReceipt(
        prisma,
        input.meta.actorUserId,
        input.organizationId,
        input.meta.commandKey,
      )
      if (replay) {
        if (replay.payloadHash !== hash) {
          throw new OrganizationDomainError('IDEMPOTENCY_CONFLICT', 'commandKey 已用于不同请求', 409)
        }
        return replay.response as T
      }
    }
    throw err
  }
}

async function lockOrganization(tx: Tx, organizationId: string): Promise<OrganizationRecord> {
  const rows = await tx.$queryRaw<OrganizationRecord[]>`
    SELECT
      "id", "name", "status",
      "created_by_user_id" AS "createdByUserId",
      "suspended_at" AS "suspendedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "organizations"
    WHERE "id" = ${organizationId}
    FOR UPDATE
  `
  if (!rows[0]) throw new OrganizationDomainError('ORG_NOT_FOUND', '组织不存在', 404)
  return rows[0]
}

async function lockCurrentMembership(
  tx: Tx,
  organizationId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const rows = await tx.$queryRaw<MembershipRecord[]>`
    SELECT
      "id",
      "organization_id" AS "organizationId",
      "user_id" AS "userId",
      "org_role" AS "orgRole",
      "valid_from" AS "validFrom",
      "valid_until" AS "validUntil",
      "ended_by_user_id" AS "endedByUserId",
      "end_reason" AS "endReason"
    FROM "organization_memberships"
    WHERE "organization_id" = ${organizationId}
      AND "id" = ${membershipId}
      AND "valid_until" IS NULL
    FOR UPDATE
  `
  if (!rows[0]) throw new OrganizationDomainError('MEMBERSHIP_NOT_CURRENT', '当前成员关系不存在', 404)
  return rows[0]
}

type DenyAuthorityRow = {
  actorPlatformRole: 'SYSTEM_ADMIN' | 'STANDARD'
  targetPlatformRole: 'SYSTEM_ADMIN' | 'STANDARD'
}

async function assertDenyTargetAuthority(
  tx: Tx,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<DenyAuthorityRow[]>`
    SELECT
      actor."platform_role"::text AS "actorPlatformRole",
      target."platform_role"::text AS "targetPlatformRole"
    FROM "users" actor
    CROSS JOIN "users" target
    WHERE actor."id" = ${actorUserId}
      AND target."id" = ${targetUserId}
    LIMIT 1
  `
  const authority = rows[0]
  if (!authority) {
    throw new OrganizationDomainError('USER_NOT_FOUND', '用户不存在', 404)
  }
  if (
    authority.targetPlatformRole === 'SYSTEM_ADMIN' &&
    authority.actorPlatformRole !== 'SYSTEM_ADMIN'
  ) {
    throw new OrganizationDomainError(
      'PLATFORM_DENY_REQUIRES_SYSTEM_ADMIN',
      '只有系统管理员可以创建或解除针对系统管理员的拒绝规则',
      403,
    )
  }
}

export async function createOrganization(input: {
  firstAdminUserId?: string
  name: string
  meta: CommandMeta
}): Promise<{ organization: OrganizationRecord; membership: MembershipRecord }> {
  const organizationId = randomUUID()
  const membershipId = randomUUID()
  return executeCommand({
    organizationId: null,
    meta: input.meta,
    payload: { name: input.name, ...(input.firstAdminUserId ? { firstAdminUserId: input.firstAdminUserId } : {}) },
    work: async (tx, domainEventId) => {
      if (input.firstAdminUserId) {
        const admins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "users" WHERE "id" = ${input.firstAdminUserId}
            AND "is_active" AND NOT "is_frozen"
            AND ("expires_at" IS NULL OR "expires_at" > statement_timestamp()) FOR SHARE
        `
        if (!admins[0]) throw new OrganizationDomainError('INITIAL_ADMIN_UNAVAILABLE', '首位管理员账户不存在或不可用', 404)
      }
      const organizations = await tx.$queryRaw<OrganizationRecord[]>`
        INSERT INTO "organizations" ("id", "name", "status", "created_by_user_id")
        VALUES (${organizationId}, ${input.name}, 'ACTIVE', ${input.meta.actorUserId})
        RETURNING
          "id", "name", "status",
          "created_by_user_id" AS "createdByUserId",
          "suspended_at" AS "suspendedAt",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
      `
      const memberships = await tx.$queryRaw<MembershipRecord[]>`
        INSERT INTO "organization_memberships" ("id", "organization_id", "user_id", "org_role")
        VALUES (${membershipId}, ${organizationId}, ${input.firstAdminUserId ?? input.meta.actorUserId}, 'ORG_ADMIN')
        RETURNING
          "id", "organization_id" AS "organizationId", "user_id" AS "userId",
          "org_role" AS "orgRole", "valid_from" AS "validFrom", "valid_until" AS "validUntil",
          "ended_by_user_id" AS "endedByUserId", "end_reason" AS "endReason"
      `
      await appendAudit(tx, {
        organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'ORGANIZATION_CREATED',
        targetType: 'ORGANIZATION',
        targetId: organizationId,
        domainEventId,
        payload: { name: input.name, initialMembershipId: membershipId },
      })
      return { organization: organizations[0], membership: memberships[0] }
    },
  })
}

export async function suspendOrganization(input: {
  organizationId: string
  meta: CommandMeta
}): Promise<OrganizationRecord> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { action: 'SUSPEND' },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      const rows = await tx.$queryRaw<OrganizationRecord[]>`
        UPDATE "organizations"
        SET "status" = 'SUSPENDED', "suspended_at" = transaction_timestamp(), "updated_at" = transaction_timestamp()
        WHERE "id" = ${input.organizationId}
        RETURNING "id", "name", "status", "created_by_user_id" AS "createdByUserId",
          "suspended_at" AS "suspendedAt", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
      `
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'ORGANIZATION_SUSPENDED',
        targetType: 'ORGANIZATION',
        targetId: input.organizationId,
        domainEventId,
        payload: {},
      })
      return rows[0]
    },
  })
}

export async function resumeOrganization(input: {
  organizationId: string
  meta: CommandMeta
}): Promise<OrganizationRecord> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { action: 'RESUME' },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      const rows = await tx.$queryRaw<OrganizationRecord[]>`
        UPDATE "organizations"
        SET "status" = 'ACTIVE', "suspended_at" = NULL, "updated_at" = transaction_timestamp()
        WHERE "id" = ${input.organizationId}
        RETURNING "id", "name", "status", "created_by_user_id" AS "createdByUserId",
          "suspended_at" AS "suspendedAt", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
      `
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'ORGANIZATION_RESUMED',
        targetType: 'ORGANIZATION',
        targetId: input.organizationId,
        domainEventId,
        payload: {},
      })
      return rows[0]
    },
  })
}

export async function createMembership(input: {
  organizationId: string
  userId: string
  orgRole?: OrganizationRole
  persona?: OrganizationPersona
  meta: CommandMeta
}): Promise<MembershipRecord> {
  const membershipId = randomUUID()
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { userId: input.userId, orgRole: input.orgRole ?? 'MEMBER', ...(input.persona?{persona:input.persona}:{}) },
    work: async (tx, domainEventId) => {
      const organization = await lockOrganization(tx, input.organizationId)
      if (organization.status !== 'ACTIVE') throw new OrganizationDomainError('ORG_SUSPENDED', '组织已暂停', 409)
      const [target]=await tx.$queryRaw<Array<{id:string;usable:boolean}>>`SELECT id,(is_active=true AND is_frozen=false AND must_change_password=false AND (expires_at IS NULL OR expires_at>statement_timestamp()) AND (role<>'TEACHER' OR teacher_approved=true)) AS usable FROM users WHERE id=${input.userId} FOR SHARE`
      if(!target)throw new OrganizationDomainError('USER_NOT_FOUND','用户不存在',404)
      if(input.orgRole==='ORG_ADMIN'&&!target.usable)throw new OrganizationDomainError('ORG_ADMIN_UNAVAILABLE','组织管理员必须先完成改密和审批，且账号处于可用状态',409)
      const rows = await tx.$queryRaw<MembershipRecord[]>`
        INSERT INTO "organization_memberships" ("id", "organization_id", "user_id", "org_role")
        VALUES (${membershipId}, ${input.organizationId}, ${input.userId}, ${input.orgRole ?? 'MEMBER'})
        RETURNING "id", "organization_id" AS "organizationId", "user_id" AS "userId",
          "org_role" AS "orgRole", "valid_from" AS "validFrom", "valid_until" AS "validUntil",
          "ended_by_user_id" AS "endedByUserId", "end_reason" AS "endReason"
      `
      if(input.persona)await tx.$executeRaw`INSERT INTO organization_persona_grants(id,organization_id,membership_id,persona,granted_by_user_id) VALUES(${randomUUID()},${input.organizationId},${membershipId},${input.persona},${input.meta.actorUserId})`
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'MEMBERSHIP_CREATED',
        targetType: 'MEMBERSHIP',
        targetId: membershipId,
        domainEventId,
        payload: { userId: input.userId, orgRole: input.orgRole ?? 'MEMBER', ...(input.persona?{persona:input.persona}:{}) },
      })
      return rows[0]
    },
  })
}

export async function rejoinMembership(input: {
  organizationId: string
  userId: string
  orgRole?: OrganizationRole
  meta: CommandMeta
}): Promise<MembershipRecord> {
  return createMembership(input)
}

export async function endMembership(input: {
  organizationId: string
  membershipId: string
  reason?: string
  meta: CommandMeta
}): Promise<MembershipRecord> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { membershipId: input.membershipId, reason: input.reason ?? null },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      const membership = await lockCurrentMembership(tx, input.organizationId, input.membershipId)
      if (membership.orgRole === 'ORG_ADMIN') {
        await assertAlternativeUsableOrgAdmin(tx, input.organizationId, membership.userId)
      }
      const rows = await tx.$queryRaw<MembershipRecord[]>`
        UPDATE "organization_memberships"
        SET "valid_until" = transaction_timestamp(), "ended_by_user_id" = ${input.meta.actorUserId}, "end_reason" = ${input.reason ?? null}
        WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.membershipId} AND "valid_until" IS NULL
        RETURNING "id", "organization_id" AS "organizationId", "user_id" AS "userId",
          "org_role" AS "orgRole", "valid_from" AS "validFrom", "valid_until" AS "validUntil",
          "ended_by_user_id" AS "endedByUserId", "end_reason" AS "endReason"
      `
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'MEMBERSHIP_ENDED',
        targetType: 'MEMBERSHIP',
        targetId: input.membershipId,
        domainEventId,
        payload: { reason: input.reason ?? null },
      })
      return rows[0]
    },
  })
}

export async function setMembershipRole(input: {
  organizationId: string
  membershipId: string
  orgRole: OrganizationRole
  meta: CommandMeta
}): Promise<MembershipRecord> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { membershipId: input.membershipId, orgRole: input.orgRole },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      const membership = await lockCurrentMembership(tx, input.organizationId, input.membershipId)
      if (membership.orgRole === input.orgRole) {
        await appendAudit(tx, {
          organizationId: input.organizationId,
          actorUserId: input.meta.actorUserId,
          action: 'MEMBERSHIP_ROLE_UNCHANGED',
          targetType: 'MEMBERSHIP',
          targetId: input.membershipId,
          domainEventId,
          payload: { role: membership.orgRole },
        })
        return membership
      }
      if(input.orgRole==='ORG_ADMIN'){
        const [target]=await tx.$queryRaw<Array<{usable:boolean}>>`SELECT (is_active=true AND is_frozen=false AND must_change_password=false AND (expires_at IS NULL OR expires_at>statement_timestamp()) AND (role<>'TEACHER' OR teacher_approved=true)) AS usable FROM users WHERE id=${membership.userId} FOR SHARE`
        if(!target?.usable)throw new OrganizationDomainError('ORG_ADMIN_UNAVAILABLE','组织管理员必须先完成改密和审批，且账号处于可用状态',409)
      }
      if (membership.orgRole === 'ORG_ADMIN' && input.orgRole !== 'ORG_ADMIN') {
        await assertAlternativeUsableOrgAdmin(tx, input.organizationId, membership.userId)
      }
      const rows = await tx.$queryRaw<MembershipRecord[]>`
        UPDATE "organization_memberships"
        SET "org_role" = ${input.orgRole}
        WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.membershipId} AND "valid_until" IS NULL
        RETURNING "id", "organization_id" AS "organizationId", "user_id" AS "userId",
          "org_role" AS "orgRole", "valid_from" AS "validFrom", "valid_until" AS "validUntil",
          "ended_by_user_id" AS "endedByUserId", "end_reason" AS "endReason"
      `
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'MEMBERSHIP_ROLE_CHANGED',
        targetType: 'MEMBERSHIP',
        targetId: input.membershipId,
        domainEventId,
        payload: { from: membership.orgRole, to: input.orgRole },
      })
      return rows[0]
    },
  })
}

async function grantNamed(input: {
  kind: 'persona' | 'capability'
  organizationId: string
  membershipId: string
  value: OrganizationPersona | OrganizationCapability
  meta: CommandMeta
}): Promise<{ id: string; value: string }> {
  const id = randomUUID()
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { kind: input.kind, membershipId: input.membershipId, value: input.value },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      await lockCurrentMembership(tx, input.organizationId, input.membershipId)
      if (input.kind === 'persona') {
        await tx.$executeRaw`
          INSERT INTO "organization_persona_grants" ("id", "organization_id", "membership_id", "persona", "granted_by_user_id")
          VALUES (${id}, ${input.organizationId}, ${input.membershipId}, ${input.value}, ${input.meta.actorUserId})
        `
      } else {
        await tx.$executeRaw`
          INSERT INTO "organization_capability_grants" ("id", "organization_id", "membership_id", "capability", "granted_by_user_id")
          VALUES (${id}, ${input.organizationId}, ${input.membershipId}, ${input.value}, ${input.meta.actorUserId})
        `
      }
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: input.kind === 'persona' ? 'PERSONA_GRANTED' : 'CAPABILITY_GRANTED',
        targetType: input.kind.toUpperCase(),
        targetId: id,
        domainEventId,
        payload: { membershipId: input.membershipId, value: input.value },
      })
      return { id, value: input.value }
    },
  })
}

export const grantPersona = (input: {
  organizationId: string
  membershipId: string
  persona: OrganizationPersona
  meta: CommandMeta
}) => grantNamed({ ...input, kind: 'persona', value: input.persona })

export const grantCapability = (input: {
  organizationId: string
  membershipId: string
  capability: OrganizationCapability
  meta: CommandMeta
}) => grantNamed({ ...input, kind: 'capability', value: input.capability })

export async function revokePersona(input: {
  organizationId: string
  membershipId: string
  persona: OrganizationPersona
  meta: CommandMeta
}): Promise<{ revoked: boolean }> {
  return revokeNamed({ ...input, kind: 'persona', value: input.persona })
}

export async function revokeCapability(input: {
  organizationId: string
  membershipId: string
  capability: OrganizationCapability
  meta: CommandMeta
}): Promise<{ revoked: boolean }> {
  return revokeNamed({ ...input, kind: 'capability', value: input.capability })
}

async function revokeNamed(input: {
  kind: 'persona' | 'capability'
  organizationId: string
  membershipId: string
  value: OrganizationPersona | OrganizationCapability
  meta: CommandMeta
}): Promise<{ revoked: boolean }> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { kind: input.kind, membershipId: input.membershipId, value: input.value, revoke: true },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      const count = input.kind === 'persona'
        ? await tx.$executeRaw`
            UPDATE "organization_persona_grants"
            SET "revoked_at" = transaction_timestamp(), "revoked_by_user_id" = ${input.meta.actorUserId}
            WHERE "organization_id" = ${input.organizationId} AND "membership_id" = ${input.membershipId}
              AND "persona" = ${input.value} AND "revoked_at" IS NULL
          `
        : await tx.$executeRaw`
            UPDATE "organization_capability_grants"
            SET "revoked_at" = transaction_timestamp(), "revoked_by_user_id" = ${input.meta.actorUserId}
            WHERE "organization_id" = ${input.organizationId} AND "membership_id" = ${input.membershipId}
              AND "capability" = ${input.value} AND "revoked_at" IS NULL
          `
      if (count === 0) throw new OrganizationDomainError('GRANT_NOT_FOUND', '当前授权不存在', 404)
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: input.kind === 'persona' ? 'PERSONA_REVOKED' : 'CAPABILITY_REVOKED',
        targetType: input.kind.toUpperCase(),
        targetId: input.membershipId,
        domainEventId,
        payload: { membershipId: input.membershipId, value: input.value },
      })
      return { revoked: true }
    },
  })
}

export async function denyOrganizationAccess(input: {
  organizationId: string
  userId: string
  permission: string
  reason: string
  meta: CommandMeta
}): Promise<{ id: string }> {
  const denyId = randomUUID()
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { userId: input.userId, permission: input.permission, reason: input.reason },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      await assertDenyTargetAuthority(tx, input.meta.actorUserId, input.userId)
      await tx.$executeRaw`
        INSERT INTO "organization_access_denies" (
          "id", "organization_id", "user_id", "permission", "reason", "denied_by_user_id"
        ) VALUES (
          ${denyId}, ${input.organizationId}, ${input.userId}, ${input.permission}, ${input.reason}, ${input.meta.actorUserId}
        )
      `
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'ACCESS_DENIED',
        targetType: 'USER',
        targetId: input.userId,
        domainEventId,
        payload: { permission: input.permission, reason: input.reason, denyId },
      })
      return { id: denyId }
    },
  })
}

export async function liftOrganizationAccessDeny(input: {
  organizationId: string
  userId: string
  permission: string
  meta: CommandMeta
}): Promise<{ lifted: boolean }> {
  return executeCommand({
    organizationId: input.organizationId,
    meta: input.meta,
    payload: { userId: input.userId, permission: input.permission, lift: true },
    work: async (tx, domainEventId) => {
      await lockOrganization(tx, input.organizationId)
      await assertDenyTargetAuthority(tx, input.meta.actorUserId, input.userId)
      const count = await tx.$executeRaw`
        UPDATE "organization_access_denies"
        SET "lifted_at" = transaction_timestamp(), "lifted_by_user_id" = ${input.meta.actorUserId}
        WHERE "organization_id" = ${input.organizationId} AND "user_id" = ${input.userId}
          AND "permission" = ${input.permission} AND "lifted_at" IS NULL
      `
      if (count === 0) throw new OrganizationDomainError('DENY_NOT_FOUND', '当前拒绝规则不存在', 404)
      await appendAudit(tx, {
        organizationId: input.organizationId,
        actorUserId: input.meta.actorUserId,
        action: 'ACCESS_DENY_LIFTED',
        targetType: 'USER',
        targetId: input.userId,
        domainEventId,
        payload: { permission: input.permission },
      })
      return { lifted: true }
    },
  })
}
