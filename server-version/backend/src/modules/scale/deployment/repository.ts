import { Prisma, type PrismaClient } from '@prisma/client'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import { parseInstrumentAuthorizationRecord } from '../../assessment-authorization/records-schema'
import {
  hashScaleDeploymentPolicy,
  scaleDeploymentPolicyV1Schema,
  type ScaleDeploymentPolicyV1,
} from '../policy/deployment'

type Db = PrismaClient | Prisma.TransactionClient

export interface StoredScaleDeploymentPolicyV1 {
  id: string
  scaleId: string
  revision: number
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  policy: ScaleDeploymentPolicyV1
  policyHash: string
  authorizationRefs: string[]
  createdByUserId: string | null
  createdAt: Date
  activatedAt: Date | null
  retiredAt: Date | null
}

type DeploymentRow = {
  id: string
  scaleId: string
  revision: number
  status: string
  policyJson: unknown
  policyHash: string
  authorizationRefs: unknown
  createdByUserId: string | null
  createdAt: Date
  activatedAt: Date | null
  retiredAt: Date | null
}

const stringArray = (value: unknown): string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : []
)

const toDeployment = (row: DeploymentRow): StoredScaleDeploymentPolicyV1 => {
  const policy = scaleDeploymentPolicyV1Schema.parse(row.policyJson)
  if (policy.revision !== row.revision) throw new Error('Scale deployment row revision does not match policy')
  if (hashScaleDeploymentPolicy(policy) !== row.policyHash) throw new Error('Scale deployment policy hash mismatch')
  if (row.status !== 'DRAFT' && row.status !== 'ACTIVE' && row.status !== 'RETIRED') {
    throw new Error(`Unsupported Scale deployment status: ${row.status}`)
  }
  const authorizationRefs = stringArray(row.authorizationRefs)
  if (JSON.stringify([...authorizationRefs].sort()) !== JSON.stringify([...policy.authorizationRefs].sort())) {
    throw new Error('Scale deployment authorization refs do not match policy')
  }
  return {
    id: row.id,
    scaleId: row.scaleId,
    revision: row.revision,
    status: row.status,
    policy,
    policyHash: row.policyHash,
    authorizationRefs,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
  }
}

export const readActiveScaleDeployment = async (
  db: Db,
  scaleId: string,
): Promise<StoredScaleDeploymentPolicyV1 | null> => {
  const rows = await db.$queryRaw<DeploymentRow[]>(Prisma.sql`
    SELECT
      "id",
      "scale_id" AS "scaleId",
      "revision",
      "status",
      "policy_json" AS "policyJson",
      "policy_hash" AS "policyHash",
      "authorization_refs" AS "authorizationRefs",
      "created_by_user_id" AS "createdByUserId",
      "created_at" AS "createdAt",
      "activated_at" AS "activatedAt",
      "retired_at" AS "retiredAt"
    FROM "scale_deployment_policies"
    WHERE "scale_id" = ${scaleId} AND "status" = 'ACTIVE'
    LIMIT 1
  `)
  return rows[0] ? toDeployment(rows[0]) : null
}

export const readScaleDeploymentRevision = async (
  db: Db,
  scaleId: string,
  revision: number,
): Promise<StoredScaleDeploymentPolicyV1 | null> => {
  const rows = await db.$queryRaw<DeploymentRow[]>(Prisma.sql`
    SELECT
      "id",
      "scale_id" AS "scaleId",
      "revision",
      "status",
      "policy_json" AS "policyJson",
      "policy_hash" AS "policyHash",
      "authorization_refs" AS "authorizationRefs",
      "created_by_user_id" AS "createdByUserId",
      "created_at" AS "createdAt",
      "activated_at" AS "activatedAt",
      "retired_at" AS "retiredAt"
    FROM "scale_deployment_policies"
    WHERE "scale_id" = ${scaleId} AND "revision" = ${revision}
    LIMIT 1
  `)
  return rows[0] ? toDeployment(rows[0]) : null
}

export const activateScaleDeploymentRevision = async (input: {
  db: Prisma.TransactionClient
  id: string
  scaleId: string
  policy: ScaleDeploymentPolicyV1
  createdByUserId: string | null
  now?: Date
}): Promise<{ created: boolean; deployment: StoredScaleDeploymentPolicyV1 }> => {
  const policy = scaleDeploymentPolicyV1Schema.parse(input.policy)
  const policyHash = hashScaleDeploymentPolicy(policy)
  const existing = await readScaleDeploymentRevision(input.db, input.scaleId, policy.revision)
  if (existing) {
    if (existing.policyHash !== policyHash) {
      throw new Error(`Scale deployment revision ${policy.revision} already exists with different policy`)
    }
    if (existing.status === 'ACTIVE') return { created: false, deployment: existing }
    throw new Error(`Scale deployment revision ${policy.revision} already exists with status ${existing.status}`)
  }

  const now = input.now ?? new Date()
  await input.db.$executeRaw(Prisma.sql`
    UPDATE "scale_deployment_policies"
    SET "status" = 'RETIRED', "retired_at" = ${now}
    WHERE "scale_id" = ${input.scaleId} AND "status" = 'ACTIVE'
  `)
  await input.db.$executeRaw(Prisma.sql`
    INSERT INTO "scale_deployment_policies" (
      "id", "scale_id", "revision", "status", "policy_json", "policy_hash",
      "authorization_refs", "created_by_user_id", "created_at", "activated_at"
    ) VALUES (
      ${input.id}::uuid,
      ${input.scaleId}::uuid,
      ${policy.revision},
      'ACTIVE',
      CAST(${JSON.stringify(policy)} AS jsonb),
      ${policyHash},
      CAST(${JSON.stringify(policy.authorizationRefs)} AS jsonb),
      ${input.createdByUserId}::uuid,
      ${now},
      ${now}
    )
  `)
  const deployment = await readScaleDeploymentRevision(input.db, input.scaleId, policy.revision)
  if (!deployment) throw new Error('Activated Scale deployment row could not be reread')
  return { created: true, deployment }
}

const toAuthorization = (row: {
  authorizationKey: string
  version: number
  instrumentKey: string
  instrumentVersion: string
  grantor: string
  grantee: string
  electronicAdministration: boolean
  scoring: boolean
  translation: boolean
  display: boolean
  territories: string[]
  locales: string[]
  commercialNature: string
  validFrom: Date
  validTo: Date
  basis: string
  status: string
  evidenceAssetId: string | null
  evidenceSha256: string | null
  selfApprovalDeclaration: string | null
  approvedByUserId: string | null
  approvedAt: Date | null
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
}): InstrumentAuthorizationRecordV1 => parseInstrumentAuthorizationRecord({
  schemaVersion: 1,
  authorizationId: row.authorizationKey,
  version: row.version,
  instrumentKey: row.instrumentKey,
  instrumentVersion: row.instrumentVersion,
  grantor: row.grantor,
  grantee: row.grantee,
  scope: {
    electronicAdministration: row.electronicAdministration,
    scoring: row.scoring,
    translation: row.translation,
    display: row.display,
    territories: row.territories,
    locales: row.locales,
    commercialNature: row.commercialNature,
  },
  validFrom: row.validFrom.toISOString(),
  validTo: row.validTo.toISOString(),
  basis: row.basis,
  status: row.status,
  evidenceAssetId: row.evidenceAssetId,
  evidenceSha256: row.evidenceSha256,
  selfApprovalDeclaration: row.selfApprovalDeclaration,
  approvedByUserId: row.approvedByUserId,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const listScaleInstrumentAuthorizations = async (
  db: Db,
  instrumentKey: string,
  instrumentVersion: string,
): Promise<InstrumentAuthorizationRecordV1[]> => {
  const rows = await db.instrumentAuthorization.findMany({
    where: { instrumentKey, instrumentVersion },
    orderBy: [{ authorizationKey: 'asc' }, { version: 'desc' }],
  })
  return rows.map(toAuthorization)
}
