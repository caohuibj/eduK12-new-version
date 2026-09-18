import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import {
  MembershipRecord,
  OrganizationDomainError,
  OrganizationRecord,
  OrganizationRole,
} from './types'

type Tx = Prisma.TransactionClient

async function lockOrganization(tx: Tx, organizationId: string): Promise<OrganizationRecord> {
  const rows = await tx.$queryRaw<OrganizationRecord[]>`
    SELECT
      "id",
      "name",
      "status",
      "created_by_user_id" AS "createdByUserId",
      "suspended_at" AS "suspendedAt",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "organizations"
    WHERE "id" = ${organizationId}
    FOR UPDATE
  `
  if (!rows[0]) {
    throw new OrganizationDomainError('ORG_NOT_FOUND', '组织不存在', 404)
  }
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
  if (!rows[0]) {
    throw new OrganizationDomainError('MEMBERSHIP_NOT_CURRENT', '当前成员关系不存在', 404)
  }
  return rows[0]
}

async function assertCanRemoveAdmin(tx: Tx, organizationId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "organization_memberships"
    WHERE "organization_id" = ${organizationId}
      AND "org_role" = 'ORG_ADMIN'
      AND "valid_until" IS NULL
  `
  if ((rows[0]?.count ?? 0) <= 1) {
    throw new OrganizationDomainError(
      'LAST_ORG_ADMIN',
      '组织必须至少保留一个有效的组织管理员',
      409,
    )
  }
}

export async function createOrganization(input: {
  name: string
  actorUserId: string
}): Promise<{ organization: OrganizationRecord; membership: MembershipRecord }> {
  const organizationId = randomUUID()
  const membershipId = randomUUID()

  return prisma.$transaction(async (tx) => {
    const organizations = await tx.$queryRaw<OrganizationRecord[]>`
      INSERT INTO "organizations" (
        "id", "name", "status", "created_by_user_id"
      ) VALUES (
        ${organizationId}, ${input.name}, 'ACTIVE', ${input.actorUserId}
      )
      RETURNING
        "id",
        "name",
        "status",
        "created_by_user_id" AS "createdByUserId",
        "suspended_at" AS "suspendedAt",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `

    const memberships = await tx.$queryRaw<MembershipRecord[]>`
      INSERT INTO "organization_memberships" (
        "id", "organization_id", "user_id", "org_role"
      ) VALUES (
        ${membershipId}, ${organizationId}, ${input.actorUserId}, 'ORG_ADMIN'
      )
      RETURNING
        "id",
        "organization_id" AS "organizationId",
        "user_id" AS "userId",
        "org_role" AS "orgRole",
        "valid_from" AS "validFrom",
        "valid_until" AS "validUntil",
        "ended_by_user_id" AS "endedByUserId",
        "end_reason" AS "endReason"
    `

    return { organization: organizations[0], membership: memberships[0] }
  })
}

export async function suspendOrganization(input: {
  organizationId: string
}): Promise<OrganizationRecord> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId)
    const rows = await tx.$queryRaw<OrganizationRecord[]>`
      UPDATE "organizations"
      SET
        "status" = 'SUSPENDED',
        "suspended_at" = transaction_timestamp(),
        "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.organizationId}
      RETURNING
        "id",
        "name",
        "status",
        "created_by_user_id" AS "createdByUserId",
        "suspended_at" AS "suspendedAt",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `
    return rows[0]
  })
}

export async function resumeOrganization(input: {
  organizationId: string
}): Promise<OrganizationRecord> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId)
    const rows = await tx.$queryRaw<OrganizationRecord[]>`
      UPDATE "organizations"
      SET
        "status" = 'ACTIVE',
        "suspended_at" = NULL,
        "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.organizationId}
      RETURNING
        "id",
        "name",
        "status",
        "created_by_user_id" AS "createdByUserId",
        "suspended_at" AS "suspendedAt",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `
    return rows[0]
  })
}

export async function createMembership(input: {
  organizationId: string
  userId: string
  orgRole?: OrganizationRole
}): Promise<MembershipRecord> {
  const membershipId = randomUUID()
  return prisma.$transaction(async (tx) => {
    const organization = await lockOrganization(tx, input.organizationId)
    if (organization.status !== 'ACTIVE') {
      throw new OrganizationDomainError('ORG_SUSPENDED', '组织已暂停', 409)
    }

    const rows = await tx.$queryRaw<MembershipRecord[]>`
      INSERT INTO "organization_memberships" (
        "id", "organization_id", "user_id", "org_role"
      ) VALUES (
        ${membershipId}, ${input.organizationId}, ${input.userId}, ${input.orgRole ?? 'MEMBER'}
      )
      RETURNING
        "id",
        "organization_id" AS "organizationId",
        "user_id" AS "userId",
        "org_role" AS "orgRole",
        "valid_from" AS "validFrom",
        "valid_until" AS "validUntil",
        "ended_by_user_id" AS "endedByUserId",
        "end_reason" AS "endReason"
    `
    return rows[0]
  })
}

export async function endMembership(input: {
  organizationId: string
  membershipId: string
  actorUserId: string
  reason?: string
}): Promise<MembershipRecord> {
  return prisma.$transaction(async (tx) => {
    // The organization row is the serialization lock for all admin-count
    // mutations. Concurrent demotions/ends therefore cannot both observe the
    // same last-admin state and commit.
    await lockOrganization(tx, input.organizationId)
    const membership = await lockCurrentMembership(tx, input.organizationId, input.membershipId)
    if (membership.orgRole === 'ORG_ADMIN') {
      await assertCanRemoveAdmin(tx, input.organizationId)
    }

    const rows = await tx.$queryRaw<MembershipRecord[]>`
      UPDATE "organization_memberships"
      SET
        "valid_until" = transaction_timestamp(),
        "ended_by_user_id" = ${input.actorUserId},
        "end_reason" = ${input.reason ?? null}
      WHERE "organization_id" = ${input.organizationId}
        AND "id" = ${input.membershipId}
        AND "valid_until" IS NULL
      RETURNING
        "id",
        "organization_id" AS "organizationId",
        "user_id" AS "userId",
        "org_role" AS "orgRole",
        "valid_from" AS "validFrom",
        "valid_until" AS "validUntil",
        "ended_by_user_id" AS "endedByUserId",
        "end_reason" AS "endReason"
    `
    return rows[0]
  })
}

export async function setMembershipRole(input: {
  organizationId: string
  membershipId: string
  orgRole: OrganizationRole
}): Promise<MembershipRecord> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId)
    const membership = await lockCurrentMembership(tx, input.organizationId, input.membershipId)
    if (membership.orgRole === input.orgRole) return membership

    if (membership.orgRole === 'ORG_ADMIN' && input.orgRole !== 'ORG_ADMIN') {
      await assertCanRemoveAdmin(tx, input.organizationId)
    }

    const rows = await tx.$queryRaw<MembershipRecord[]>`
      UPDATE "organization_memberships"
      SET "org_role" = ${input.orgRole}
      WHERE "organization_id" = ${input.organizationId}
        AND "id" = ${input.membershipId}
        AND "valid_until" IS NULL
      RETURNING
        "id",
        "organization_id" AS "organizationId",
        "user_id" AS "userId",
        "org_role" AS "orgRole",
        "valid_from" AS "validFrom",
        "valid_until" AS "validUntil",
        "ended_by_user_id" AS "endedByUserId",
        "end_reason" AS "endReason"
    `
    return rows[0]
  })
}

export async function rejoinMembership(input: {
  organizationId: string
  userId: string
  orgRole?: OrganizationRole
}): Promise<MembershipRecord> {
  // Never update or resurrect a historical row. The partial unique index only
  // blocks an already-current episode; once ended, rejoin receives a new id.
  return createMembership(input)
}
