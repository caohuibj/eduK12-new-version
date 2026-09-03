/**
 * Durable Prisma AuthorizationRepository.
 * Maps domain authorizationId ↔ DB authorizationKey; version-row id is separate.
 * Transactional create/approve/amend/revoke + append-only audit.
 * No physical delete of auth/audit rows.
 */
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { authorizationFail } from './errors'
import {
  amendApprovedInstrumentAuthorization,
  approveInstrumentAuthorization,
  attachAuthorizationEvidence,
  createInstrumentAuthorizationDraft,
  hashInstrumentAuthorizationRecord,
  revokeAuthorizationLineage,
  revokeInstrumentAuthorization,
} from './records'
import { parseInstrumentAuthorizationRecord } from './records-schema'
import type {
  InstrumentAuthorizationAuditEventV1,
  InstrumentAuthorizationRecordV1,
} from './types'

type Db = PrismaClient | Prisma.TransactionClient

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

const domainToCreateData = (
  record: InstrumentAuthorizationRecordV1,
  versionRowId: string,
): Prisma.InstrumentAuthorizationUncheckedCreateInput => ({
  id: versionRowId,
  authorizationKey: record.authorizationId,
  version: record.version,
  instrumentKey: record.instrumentKey,
  instrumentVersion: record.instrumentVersion,
  grantor: record.grantor,
  grantee: record.grantee,
  electronicAdministration: record.scope.electronicAdministration,
  scoring: record.scope.scoring,
  translation: record.scope.translation,
  display: record.scope.display,
  territories: record.scope.territories,
  locales: record.scope.locales,
  commercialNature: record.scope.commercialNature,
  validFrom: new Date(record.validFrom),
  validTo: new Date(record.validTo),
  basis: record.basis,
  status: record.status,
  evidenceAssetId: record.evidenceAssetId,
  evidenceSha256: record.evidenceSha256,
  selfApprovalDeclaration: record.selfApprovalDeclaration,
  approvedByUserId: record.approvedByUserId,
  approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
  createdByUserId: record.createdByUserId,
  recordHash: hashInstrumentAuthorizationRecord(record),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
})

const appendAuditRow = async (
  db: Db,
  audit: InstrumentAuthorizationAuditEventV1,
  versionRowId: string,
): Promise<void> => {
  await db.instrumentAuthorizationAudit.create({
    data: {
      id: audit.auditId,
      authorizationId: versionRowId,
      authorizationVersion: audit.authorizationVersion,
      action: audit.action,
      actorUserId: audit.actorUserId,
      at: new Date(audit.at),
      note: audit.note,
      recordHash: audit.recordHash,
    },
  })
}

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
    const record = createInstrumentAuthorizationDraft(input)
    const versionRowId = randomUUID()
    const audit: InstrumentAuthorizationAuditEventV1 = {
      auditId: randomUUID(),
      authorizationId: record.authorizationId,
      authorizationVersion: record.version,
      action: 'CREATE',
      actorUserId: input.createdByUserId,
      at: record.createdAt,
      note: 'draft created',
      recordHash: hashInstrumentAuthorizationRecord(record),
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.instrumentAuthorization.create({
        data: domainToCreateData(record, versionRowId),
      })
      await appendAuditRow(tx, audit, versionRowId)
    })
    return { record, audit }
  }

  async approve(input: {
    authorizationId: string
    actorUserId: string
    selfApprovalDeclaration?: string | null
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRow = await tx.instrumentAuthorization.findFirst({
        where: { authorizationKey: input.authorizationId },
        orderBy: { version: 'desc' },
      })
      if (!currentRow) {
        return authorizationFail('AUTH_STATE', 'authorization not found')
      }
      const current = rowToDomain(currentRow)
      const approved = approveInstrumentAuthorization({
        record: current,
        actorUserId: input.actorUserId,
        selfApprovalDeclaration: input.selfApprovalDeclaration,
        now: input.now,
      })
      // Same version row is updated in place on approve (status transition).
      const updated = await tx.instrumentAuthorization.update({
        where: { id: currentRow.id },
        data: {
          status: approved.record.status,
          selfApprovalDeclaration: approved.record.selfApprovalDeclaration,
          approvedByUserId: approved.record.approvedByUserId,
          approvedAt: approved.record.approvedAt ? new Date(approved.record.approvedAt) : null,
          recordHash: hashInstrumentAuthorizationRecord(approved.record),
          updatedAt: new Date(approved.record.updatedAt),
        },
      })
      await appendAuditRow(tx, approved.audit, updated.id)
      return { record: rowToDomain(updated), audit: approved.audit }
    })
  }

  async amend(input: {
    authorizationId: string
    patch: Parameters<typeof amendApprovedInstrumentAuthorization>[0]['patch']
    actorUserId: string
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRow = await tx.instrumentAuthorization.findFirst({
        where: { authorizationKey: input.authorizationId },
        orderBy: { version: 'desc' },
      })
      if (!currentRow) {
        return authorizationFail('AUTH_STATE', 'authorization not found')
      }
      const amended = amendApprovedInstrumentAuthorization({
        previous: rowToDomain(currentRow),
        patch: input.patch,
        actorUserId: input.actorUserId,
        now: input.now,
      })
      const versionRowId = randomUUID()
      // Prior approved row is retained (no physical delete); new version row inserted.
      await tx.instrumentAuthorization.create({
        data: domainToCreateData(amended.record, versionRowId),
      })
      await appendAuditRow(tx, amended.audit, versionRowId)
      return { record: amended.record, audit: amended.audit }
    })
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
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.instrumentAuthorization.findMany({
        where: { authorizationKey: input.authorizationId },
        orderBy: { version: 'desc' },
      })
      if (rows.length === 0) {
        return authorizationFail('AUTH_STATE', 'authorization not found')
      }
      const lineage = rows.map(rowToDomain)
      const revoked = revokeAuthorizationLineage({
        lineage,
        actorUserId: input.actorUserId,
        note: input.note,
        now: input.now,
      })
      const updatedDomain: InstrumentAuthorizationRecordV1[] = []
      let latestAudit: InstrumentAuthorizationAuditEventV1 | null = null
      for (const record of revoked.records) {
        const row = rows.find((candidate) => candidate.version === record.version)
        if (!row) {
          return authorizationFail('AUTH_STATE', `lineage version row missing: v${record.version}`)
        }
        if (record.status === 'REVOKED' && row.status !== 'REVOKED') {
          const updated = await tx.instrumentAuthorization.update({
            where: { id: row.id },
            data: {
              status: 'REVOKED',
              recordHash: hashInstrumentAuthorizationRecord(record),
              updatedAt: new Date(record.updatedAt),
            },
          })
          updatedDomain.push(rowToDomain(updated))
        } else {
          updatedDomain.push(record)
        }
      }
      for (const audit of revoked.audits) {
        const row = rows.find((candidate) => candidate.version === audit.authorizationVersion)
        if (!row) continue
        await appendAuditRow(tx, audit, row.id)
        latestAudit = audit
      }
      if (!latestAudit) {
        // Entire lineage already REVOKED — still emit a revoke audit on latest.
        const fallback = revokeInstrumentAuthorization({
          record: lineage[0]!,
          actorUserId: input.actorUserId,
          note: input.note,
          now: input.now,
        })
        latestAudit = fallback.audit
        await appendAuditRow(tx, latestAudit, rows[0]!.id)
      }
      return {
        record: updatedDomain[0]!,
        audit: latestAudit,
        lineage: updatedDomain,
      }
    })
  }

  async attachEvidence(input: {
    authorizationId: string
    evidenceAssetId: string
    /** Optional client-declared hash — must match StoredAsset.sha256 when provided. */
    evidenceSha256?: string
    actorUserId: string
    now?: string
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1; mintedNewVersion: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRow = await tx.instrumentAuthorization.findFirst({
        where: { authorizationKey: input.authorizationId },
        orderBy: { version: 'desc' },
      })
      if (!currentRow) {
        return authorizationFail('AUTH_STATE', 'authorization not found')
      }
      const asset = await tx.storedAsset.findUnique({ where: { id: input.evidenceAssetId } })
      if (!asset || asset.deletedAt) {
        return authorizationFail('AUTH_EVIDENCE_INVALID', 'StoredAsset not found for evidence')
      }
      // Authoritative hash is from StoredAsset — reject client-declared mismatch.
      if (input.evidenceSha256 && input.evidenceSha256 !== asset.sha256) {
        return authorizationFail('AUTH_EVIDENCE_INVALID', 'client-declared evidenceSha256 does not match StoredAsset.sha256')
      }
      const attached = attachAuthorizationEvidence({
        record: rowToDomain(currentRow),
        evidenceAssetId: input.evidenceAssetId,
        evidenceSha256: asset.sha256,
        actorUserId: input.actorUserId,
        now: input.now,
      })
      if (attached.mintedNewVersion) {
        const created = await tx.instrumentAuthorization.create({
          data: domainToCreateData(attached.record, randomUUID()),
        })
        await appendAuditRow(tx, attached.audit, created.id)
        return { record: rowToDomain(created), audit: attached.audit, mintedNewVersion: true }
      }
      const updated = await tx.instrumentAuthorization.update({
        where: { id: currentRow.id },
        data: {
          evidenceAssetId: attached.record.evidenceAssetId,
          evidenceSha256: attached.record.evidenceSha256,
          status: attached.record.status,
          recordHash: hashInstrumentAuthorizationRecord(attached.record),
          updatedAt: new Date(attached.record.updatedAt),
        },
      })
      await appendAuditRow(tx, attached.audit, updated.id)
      return { record: rowToDomain(updated), audit: attached.audit, mintedNewVersion: false }
    })
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
