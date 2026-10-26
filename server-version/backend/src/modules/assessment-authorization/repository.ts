/**
 * Durable Prisma AuthorizationRepository.
 * Maps domain authorizationId ↔ DB authorizationKey; version-row id is separate.
 * Legacy read-only decoder. All mutations fail before database access.
 * No physical delete of auth/audit rows.
 */
import type { PrismaClient } from '@prisma/client'
import { authorizationFail } from './errors'
import type { amendApprovedInstrumentAuthorization } from './records'
import { parseInstrumentAuthorizationRecord } from './records-schema'
import type {
  InstrumentAuthorizationAuditEventV1,
  InstrumentAuthorizationRecordV1,
} from './types'


const toIso = (value: Date): string => value.toISOString()

const rowToDomain = (row: {
  id: string
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
    territories: [...row.territories],
    locales: [...row.locales],
    commercialNature: row.commercialNature,
  },
  validFrom: toIso(row.validFrom),
  validTo: toIso(row.validTo),
  basis: row.basis,
  status: row.status,
  evidenceAssetId: row.evidenceAssetId,
  evidenceSha256: row.evidenceSha256,
  selfApprovalDeclaration: row.selfApprovalDeclaration,
  approvedByUserId: row.approvedByUserId,
  approvedAt: row.approvedAt ? toIso(row.approvedAt) : null,
  createdByUserId: row.createdByUserId,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
})

export class PrismaAuthorizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<InstrumentAuthorizationRecordV1[]> {
    const rows = await this.prisma.instrumentAuthorization.findMany({
      orderBy: [{ instrumentKey: 'asc' }, { authorizationKey: 'asc' }, { version: 'desc' }],
    })
    return rows.map(rowToDomain)
  }

  async listLatestByInstrument(instrumentKey: string): Promise<InstrumentAuthorizationRecordV1[]> {
    const rows = await this.prisma.instrumentAuthorization.findMany({
      where: { instrumentKey },
      orderBy: [{ authorizationKey: 'asc' }, { version: 'desc' }],
    })
    return rows.map(rowToDomain)
  }

  async getLatest(authorizationId: string): Promise<InstrumentAuthorizationRecordV1 | null> {
    const row = await this.prisma.instrumentAuthorization.findFirst({
      where: { authorizationKey: authorizationId },
      orderBy: { version: 'desc' },
    })
    return row ? rowToDomain(row) : null
  }

  async createDraft(input: {
    instrumentKey: string
    instrumentVersion: string
    grantor: string
    grantee: string
    scope: InstrumentAuthorizationRecordV1['scope']
    validFrom: string
    validTo: string
    basis: string
    createdByUserId: string
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return authorizationFail('AUTHORIZATION_RECORDS_RETIRED', '版权许可台账已退役，不再保存或变更许可记录。')
  }

  async approve(input: {
    authorizationId: string
    actorUserId: string
    selfApprovalDeclaration?: string | null
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return authorizationFail('AUTHORIZATION_RECORDS_RETIRED', '版权许可台账已退役，不再保存或变更许可记录。')
  }

  async amend(input: {
    authorizationId: string
    patch: Parameters<typeof amendApprovedInstrumentAuthorization>[0]['patch']
    actorUserId: string
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return authorizationFail('AUTHORIZATION_RECORDS_RETIRED', '版权许可台账已退役，不再保存或变更许可记录。')
  }

  async revoke(input: {
    authorizationId: string
    actorUserId: string
    note: string
    now?: string
  }): Promise<{
    record: InstrumentAuthorizationRecordV1
    audit: InstrumentAuthorizationAuditEventV1
    lineage: InstrumentAuthorizationRecordV1[]
  }> {
    return authorizationFail('AUTHORIZATION_RECORDS_RETIRED', '版权许可台账已退役，不再保存或变更许可记录。')
  }

  async attachEvidence(input: {
    authorizationId: string
    evidenceAssetId: string
    /** Optional client-declared hash — must match StoredAsset.sha256 when provided. */
    evidenceSha256?: string
    actorUserId: string
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1; mintedNewVersion: boolean }> {
    return authorizationFail('AUTHORIZATION_RECORDS_RETIRED', '版权许可台账已退役，不再保存或变更许可记录。')
  }
}

export const createPrismaAuthorizationRepository = (
  prisma: PrismaClient,
): PrismaAuthorizationRepository => new PrismaAuthorizationRepository(prisma)

/** Test helper: map without DB. */
export const mapAuthorizationRowToDomain = rowToDomain

export const assertNoPhysicalAuthorizationDelete = (): void => {
  // Repository API surface intentionally omits delete/destroy methods.
}
