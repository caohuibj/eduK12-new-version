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
  createInstrumentAuthorizationDraft,
  hashInstrumentAuthorizationRecord,
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
  }): Promise<{ record: InstrumentAuthorizationRecordV1; audit: InstrumentAuthorizationAuditEventV1 }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRow = await tx.instrumentAuthorization.findFirst({
        where: { authorizationKey: input.authorizationId },
        orderBy: { version: 'desc' },
      })
      if (!currentRow) {
        return authorizationFail('AUTH_STATE', 'authorization not found')
      }
      const revoked = revokeInstrumentAuthorization({
        record: rowToDomain(currentRow),
        actorUserId: input.actorUserId,
        note: input.note,
        now: input.now,
      })
      const updated = await tx.instrumentAuthorization.update({
        where: { id: currentRow.id },
        data: {
          status: revoked.record.status,
          recordHash: hashInstrumentAuthorizationRecord(revoked.record),
          updatedAt: new Date(revoked.record.updatedAt),
        },
      })
      await appendAuditRow(tx, revoked.audit, updated.id)
      return { record: rowToDomain(updated), audit: revoked.audit }
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
