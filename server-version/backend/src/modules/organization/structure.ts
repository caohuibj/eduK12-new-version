import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { OrganizationDomainError } from './types'

export type OrganizationUnitKind = 'GRADE' | 'CLASS'

export interface OrganizationUnitRecord {
  id: string
  organizationId: string
  unitKind: OrganizationUnitKind
  name: string
  parentUnitId: string | null
  createdAt: Date
  updatedAt: Date
}

type OrganizationStateRow = { id: string; status: 'ACTIVE' | 'SUSPENDED' }

const selectUnitSql = `
  SELECT "id", "organization_id" AS "organizationId", "unit_kind" AS "unitKind",
         "name", "parent_unit_id" AS "parentUnitId", "created_at" AS "createdAt",
         "updated_at" AS "updatedAt"
  FROM "organization_units"
`

/**
 * Structural writes are deliberately kept separate from PR1 identity/governance.
 * API authorization is added in PR2-C16; this service owns structural invariants.
 */
export async function createOrganizationUnit(input: {
  organizationId: string
  unitKind: OrganizationUnitKind
  name: string
  parentUnitId?: string | null
}): Promise<OrganizationUnitRecord> {
  const name = input.name.trim()
  if (!name) throw new OrganizationDomainError('UNIT_NAME_REQUIRED', '结构单元名称不能为空', 400)
  if (input.unitKind === 'GRADE' && input.parentUnitId) {
    throw new OrganizationDomainError('GRADE_PARENT_FORBIDDEN', '年级不能设置父级', 400)
  }
  if (input.unitKind === 'CLASS' && !input.parentUnitId) {
    throw new OrganizationDomainError('CLASS_GRADE_REQUIRED', '班级必须属于一个年级', 400)
  }

  return prisma.$transaction(async (tx) => {
    const orgRows = await tx.$queryRaw<OrganizationStateRow[]>`
      SELECT "id", "status"
      FROM "organizations"
      WHERE "id" = ${input.organizationId}
      FOR SHARE
    `
    const organization = orgRows[0]
    if (!organization) throw new OrganizationDomainError('ORG_NOT_FOUND', '组织不存在', 404)
    if (organization.status !== 'ACTIVE') {
      throw new OrganizationDomainError('ORGANIZATION_SUSPENDED', '组织已暂停', 409)
    }

    if (input.unitKind === 'CLASS') {
      const parents = await tx.$queryRaw<Array<{ unitKind: OrganizationUnitKind }>>`
        SELECT "unit_kind" AS "unitKind"
        FROM "organization_units"
        WHERE "organization_id" = ${input.organizationId}
          AND "id" = ${input.parentUnitId!}
        FOR SHARE
      `
      if (!parents[0]) {
        throw new OrganizationDomainError('UNIT_PARENT_NOT_FOUND', '父级年级不存在', 404)
      }
      if (parents[0].unitKind !== 'GRADE') {
        throw new OrganizationDomainError('CLASS_PARENT_MUST_BE_GRADE', '班级父级必须是年级', 409)
      }
    }

    const id = randomUUID()
    const rows = await tx.$queryRaw<OrganizationUnitRecord[]>`
      INSERT INTO "organization_units" (
        "id", "organization_id", "unit_kind", "name", "parent_unit_id"
      ) VALUES (
        ${id}, ${input.organizationId}, ${input.unitKind}, ${name}, ${input.parentUnitId ?? null}
      )
      RETURNING "id", "organization_id" AS "organizationId", "unit_kind" AS "unitKind",
                "name", "parent_unit_id" AS "parentUnitId", "created_at" AS "createdAt",
                "updated_at" AS "updatedAt"
    `
    return rows[0]
  })
}

export async function listOrganizationUnits(organizationId: string): Promise<OrganizationUnitRecord[]> {
  return prisma.$queryRawUnsafe<OrganizationUnitRecord[]>(
    `${selectUnitSql} WHERE "organization_id" = $1 ORDER BY "unit_kind", "name", "id"`,
    organizationId,
  )
}

/**
 * Deletion is only allowed for an unreferenced unit. PostgreSQL RESTRICT FKs are
 * authoritative, so a Grade that still owns Classes (or later historical refs)
 * cannot be silently cascaded away.
 */
export async function deleteOrganizationUnit(input: {
  organizationId: string
  unitId: string
}): Promise<void> {
  try {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "organization_units"
      WHERE "organization_id" = ${input.organizationId}
        AND "id" = ${input.unitId}
    `
    if (Number(deleted) !== 1) {
      throw new OrganizationDomainError('UNIT_NOT_FOUND', '结构单元不存在', 404)
    }
  } catch (err: any) {
    const postgresCode = err?.meta?.code ?? err?.code
    if (postgresCode === '23503' || err?.code === 'P2010') {
      throw new OrganizationDomainError('UNIT_REFERENCED', '结构单元仍被历史或子级记录引用', 409)
    }
    throw err
  }
}
