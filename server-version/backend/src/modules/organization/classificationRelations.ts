import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { OrganizationDomainError } from './types'
import { assertCurrentMembershipPersona } from './classRelationships'

export type ClassificationCardinality = 'SINGLE' | 'MULTI'

export interface ClassificationDimensionRecord {
  id: string
  organizationId: string
  key: string
  name: string
  cardinality: ClassificationCardinality
}

export interface OrganizationLabelRecord {
  id: string
  organizationId: string
  dimensionId: string
  name: string
}

export interface CounselorClientRelationshipRecord {
  id: string
  organizationId: string
  counselorMembershipId: string
  clientMembershipId: string
  validFrom: Date
  validUntil: Date | null
}

async function assertActiveOrganization(organizationId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "organizations" WHERE "id" = ${organizationId}
  `
  if (!rows[0]) throw new OrganizationDomainError('ORG_NOT_FOUND', '组织不存在', 404)
  if (rows[0].status !== 'ACTIVE') {
    throw new OrganizationDomainError('ORGANIZATION_SUSPENDED', '组织已暂停', 409)
  }
}

export async function createClassificationDimension(input: {
  organizationId: string
  key: string
  name: string
  cardinality: ClassificationCardinality
}): Promise<ClassificationDimensionRecord> {
  const key = input.key.trim()
  const name = input.name.trim()
  if (!key || !name) throw new OrganizationDomainError('CLASSIFICATION_NAME_REQUIRED', '分类维度 key/name 不能为空', 400)
  await assertActiveOrganization(input.organizationId)
  const id = randomUUID()
  try {
    const rows = await prisma.$queryRaw<ClassificationDimensionRecord[]>`
      INSERT INTO "organization_classification_dimensions" (
        "id", "organization_id", "key", "name", "cardinality"
      ) VALUES (${id}, ${input.organizationId}, ${key}, ${name}, ${input.cardinality})
      RETURNING "id", "organization_id" AS "organizationId", "key", "name", "cardinality"
    `
    return rows[0]
  } catch (err: any) {
    if (err?.meta?.code === '23505') {
      throw new OrganizationDomainError('CLASSIFICATION_DIMENSION_CONFLICT', '分类维度 key 已存在', 409)
    }
    throw err
  }
}

export async function createOrganizationLabel(input: {
  organizationId: string
  dimensionId: string
  name: string
}): Promise<OrganizationLabelRecord> {
  const name = input.name.trim()
  if (!name) throw new OrganizationDomainError('LABEL_NAME_REQUIRED', '标签名称不能为空', 400)
  await assertActiveOrganization(input.organizationId)
  const id = randomUUID()
  try {
    const rows = await prisma.$queryRaw<OrganizationLabelRecord[]>`
      INSERT INTO "organization_labels" ("id", "organization_id", "dimension_id", "name")
      VALUES (${id}, ${input.organizationId}, ${input.dimensionId}, ${name})
      RETURNING "id", "organization_id" AS "organizationId", "dimension_id" AS "dimensionId", "name"
    `
    return rows[0]
  } catch (err: any) {
    const code = err?.meta?.code ?? err?.code
    if (code === '23503') throw new OrganizationDomainError('CLASSIFICATION_DIMENSION_NOT_FOUND', '分类维度不存在', 404)
    if (code === '23505') throw new OrganizationDomainError('LABEL_CONFLICT', '该维度中标签名称已存在', 409)
    throw err
  }
}

export async function assignOrganizationLabel(input: {
  organizationId: string
  membershipId: string
  labelId: string
}): Promise<{ id: string; dimensionId: string; cardinality: ClassificationCardinality }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const membership = await tx.$queryRaw<Array<{ current: boolean }>>`
        SELECT (m."valid_until" IS NULL) AS "current"
        FROM "organization_memberships" m
        JOIN "organizations" o ON o."id" = m."organization_id"
        WHERE m."organization_id" = ${input.organizationId}
          AND m."id" = ${input.membershipId}
          AND o."status" = 'ACTIVE'
        FOR SHARE OF m, o
      `
      if (!membership[0]) throw new OrganizationDomainError('MEMBERSHIP_NOT_FOUND', '成员关系不存在', 404)
      if (!membership[0].current) throw new OrganizationDomainError('MEMBERSHIP_NOT_CURRENT', '成员关系已结束', 409)

      const labels = await tx.$queryRaw<Array<{ dimensionId: string; cardinality: ClassificationCardinality }>>`
        SELECT l."dimension_id" AS "dimensionId", d."cardinality"
        FROM "organization_labels" l
        JOIN "organization_classification_dimensions" d
          ON d."organization_id" = l."organization_id" AND d."id" = l."dimension_id"
        WHERE l."organization_id" = ${input.organizationId}
          AND l."id" = ${input.labelId}
        FOR SHARE OF l, d
      `
      const label = labels[0]
      if (!label) throw new OrganizationDomainError('LABEL_NOT_FOUND', '标签不存在', 404)
      const id = randomUUID()
      await tx.$executeRaw`
        INSERT INTO "organization_label_assignments" (
          "id", "organization_id", "membership_id", "dimension_id", "dimension_cardinality", "label_id"
        ) VALUES (
          ${id}, ${input.organizationId}, ${input.membershipId}, ${label.dimensionId}, ${label.cardinality}, ${input.labelId}
        )
      `
      return { id, dimensionId: label.dimensionId, cardinality: label.cardinality }
    })
  } catch (err: any) {
    const code = err?.meta?.code ?? err?.code
    const message = String(err?.meta?.message ?? err?.message ?? '')
    if (code === '23505' || (err?.code === 'P2010' && message.includes('unique'))) {
      throw new OrganizationDomainError('LABEL_ASSIGNMENT_CONFLICT', '当前标签分配违反维度唯一性', 409)
    }
    throw err
  }
}

export async function endOrganizationLabelAssignment(input: {
  organizationId: string
  assignmentId: string
}): Promise<void> {
  const count = await prisma.$executeRaw`
    UPDATE "organization_label_assignments"
    SET "valid_until" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId}
      AND "id" = ${input.assignmentId}
      AND "valid_until" IS NULL
  `
  if (Number(count) !== 1) throw new OrganizationDomainError('LABEL_ASSIGNMENT_NOT_CURRENT', '当前标签分配不存在', 404)
}

export async function createCounselorClientRelationship(input: {
  organizationId: string
  counselorMembershipId: string
  clientMembershipId: string
}): Promise<CounselorClientRelationshipRecord> {
  if (input.counselorMembershipId === input.clientMembershipId) {
    throw new OrganizationDomainError('PROFESSIONAL_RELATION_DISTINCT_REQUIRED', '咨询关系两端必须是不同 Membership', 400)
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCurrentMembershipPersona(tx, {
        organizationId: input.organizationId,
        membershipId: input.counselorMembershipId,
        persona: 'COUNSELOR',
      })
      await assertCurrentMembershipPersona(tx, {
        organizationId: input.organizationId,
        membershipId: input.clientMembershipId,
        persona: 'CLIENT',
      })
      const id = randomUUID()
      const rows = await tx.$queryRaw<CounselorClientRelationshipRecord[]>`
        INSERT INTO "organization_counselor_client_relationships" (
          "id", "organization_id", "counselor_membership_id", "client_membership_id"
        ) VALUES (
          ${id}, ${input.organizationId}, ${input.counselorMembershipId}, ${input.clientMembershipId}
        )
        RETURNING "id", "organization_id" AS "organizationId",
          "counselor_membership_id" AS "counselorMembershipId",
          "client_membership_id" AS "clientMembershipId",
          "valid_from" AS "validFrom", "valid_until" AS "validUntil"
      `
      return rows[0]
    })
  } catch (err: any) {
    const code = err?.meta?.code ?? err?.code
    if (code === '23505') throw new OrganizationDomainError('PROFESSIONAL_RELATION_CONFLICT', '当前咨询关系已存在', 409)
    throw err
  }
}

export async function endCounselorClientRelationship(input: {
  organizationId: string
  relationshipId: string
}): Promise<void> {
  const count = await prisma.$executeRaw`
    UPDATE "organization_counselor_client_relationships"
    SET "valid_until" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId}
      AND "id" = ${input.relationshipId}
      AND "valid_until" IS NULL
  `
  if (Number(count) !== 1) throw new OrganizationDomainError('PROFESSIONAL_RELATION_NOT_CURRENT', '当前咨询关系不存在', 404)
}

export async function hasCurrentCounselorClientAuthority(input: {
  organizationId: string
  counselorMembershipId: string
  clientMembershipId: string
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "organization_counselor_client_relationships" r
      JOIN "organizations" o ON o."id" = r."organization_id"
      JOIN "organization_memberships" cm
        ON cm."organization_id" = r."organization_id" AND cm."id" = r."counselor_membership_id"
      JOIN "organization_memberships" lm
        ON lm."organization_id" = r."organization_id" AND lm."id" = r."client_membership_id"
      WHERE r."organization_id" = ${input.organizationId}
        AND r."counselor_membership_id" = ${input.counselorMembershipId}
        AND r."client_membership_id" = ${input.clientMembershipId}
        AND r."valid_until" IS NULL
        AND o."status" = 'ACTIVE'
        AND cm."valid_until" IS NULL AND lm."valid_until" IS NULL
        AND EXISTS (
          SELECT 1 FROM "organization_persona_grants" pg
          WHERE pg."organization_id" = r."organization_id"
            AND pg."membership_id" = r."counselor_membership_id"
            AND pg."persona" = 'COUNSELOR' AND pg."revoked_at" IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM "organization_persona_grants" pg
          WHERE pg."organization_id" = r."organization_id"
            AND pg."membership_id" = r."client_membership_id"
            AND pg."persona" = 'CLIENT' AND pg."revoked_at" IS NULL
        )
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}
