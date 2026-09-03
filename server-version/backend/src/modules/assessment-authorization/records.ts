import { createHash, randomUUID } from 'node:crypto'
import { canonicalHash } from '../assessment-runtime/canonical'
import { authorizationFail } from './errors'
import {
  INSTRUMENT_AUTHORIZATION_SCHEMA,
  type InstrumentAuthorizationActionV1,
  type InstrumentAuthorizationAuditEventV1,
  type InstrumentAuthorizationRecordV1,
  type InstrumentAuthorizationStatusV1,
  type InstrumentCommercialNatureV1,
} from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/
const HEX = /^[0-9a-f]{64}$/

const assertInstant = (value: string, label: string): void => {
  if (!ISO.test(value) || Number.isNaN(Date.parse(value))) {
    authorizationFail('AUTH_DATETIME_INVALID', `${label} 必须是严格 UTC datetime`)
  }
}

export const hashInstrumentAuthorizationRecord = (
  record: InstrumentAuthorizationRecordV1,
): string => canonicalHash(record)

export const validateInstrumentAuthorizationRecord = (
  value: InstrumentAuthorizationRecordV1 | unknown,
): InstrumentAuthorizationRecordV1 => {
  const record = value as InstrumentAuthorizationRecordV1
  if (!record || typeof record !== 'object') {
    authorizationFail('AUTH_RECORD_INVALID', 'authorization record 缺失')
  }
  if (record.schemaVersion !== INSTRUMENT_AUTHORIZATION_SCHEMA) {
    authorizationFail('AUTH_RECORD_INVALID', 'authorization schemaVersion 不支持')
  }
  if (!record.authorizationId || !record.instrumentKey || !record.instrumentVersion) {
    authorizationFail('AUTH_RECORD_INVALID', 'authorization identity 缺失')
  }
  if (!Number.isInteger(record.version) || record.version < 1) {
    authorizationFail('AUTH_RECORD_INVALID', 'authorization version 必须从 1 开始')
  }
  assertInstant(record.validFrom, 'validFrom')
  assertInstant(record.validTo, 'validTo')
  assertInstant(record.createdAt, 'createdAt')
  assertInstant(record.updatedAt, 'updatedAt')
  if (Date.parse(record.validTo) <= Date.parse(record.validFrom)) {
    authorizationFail('AUTH_SCOPE_INVALID', 'validTo 必须晚于 validFrom')
  }
  if (!record.scope?.territories?.length || !record.scope.locales?.length) {
    authorizationFail('AUTH_SCOPE_INVALID', 'territories/locales 不得为空')
  }
  const natures: InstrumentCommercialNatureV1[] = ['NON_COMMERCIAL', 'COMMERCIAL', 'UNSPECIFIED']
  if (!natures.includes(record.scope.commercialNature)) {
    authorizationFail('AUTH_SCOPE_INVALID', 'commercialNature 非法')
  }
  if (record.evidenceSha256 && !HEX.test(record.evidenceSha256)) {
    authorizationFail('AUTH_EVIDENCE_INVALID', 'evidenceSha256 必须是 64 hex')
  }
  if ((record.evidenceAssetId && !record.evidenceSha256) || (!record.evidenceAssetId && record.evidenceSha256)) {
    authorizationFail('AUTH_EVIDENCE_INVALID', 'evidenceAssetId 与 evidenceSha256 必须同时存在或同时为空')
  }
  return record
}

export const createInstrumentAuthorizationDraft = (input: {
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
}): InstrumentAuthorizationRecordV1 => {
  const now = input.now ?? new Date().toISOString()
  return validateInstrumentAuthorizationRecord({
    schemaVersion: INSTRUMENT_AUTHORIZATION_SCHEMA,
    authorizationId: randomUUID(),
    version: 1,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    grantor: input.grantor,
    grantee: input.grantee,
    scope: {
      ...input.scope,
      territories: [...input.scope.territories],
      locales: [...input.scope.locales],
    },
    validFrom: input.validFrom,
    validTo: input.validTo,
    basis: input.basis,
    status: 'DRAFT',
    evidenceAssetId: null,
    evidenceSha256: null,
    selfApprovalDeclaration: null,
    approvedByUserId: null,
    approvedAt: null,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  })
}

const appendAudit = (
  record: InstrumentAuthorizationRecordV1,
  action: InstrumentAuthorizationActionV1,
  actorUserId: string,
  note: string,
  at: string,
): InstrumentAuthorizationAuditEventV1 => ({
  auditId: randomUUID(),
  authorizationId: record.authorizationId,
  authorizationVersion: record.version,
  action,
  actorUserId,
  at,
  note,
  recordHash: hashInstrumentAuthorizationRecord(record),
})

/**
 * Approve an authorization.
 * Same admin may self-approve, but must provide a non-empty confirmation declaration.
 * Changes after approval create a new version (caller supplies next draft via amend).
 */
export const approveInstrumentAuthorization = (input: {
  record: InstrumentAuthorizationRecordV1
  actorUserId: string
  selfApprovalDeclaration?: string | null
  now?: string
}): {
  record: InstrumentAuthorizationRecordV1
  audit: InstrumentAuthorizationAuditEventV1
} => {
  const current = validateInstrumentAuthorizationRecord(input.record)
  if (current.status !== 'DRAFT' && current.status !== 'EVIDENCE_PENDING') {
    authorizationFail('AUTH_STATE', `只有 DRAFT/EVIDENCE_PENDING 可批准，当前 ${current.status}`)
  }
  const now = input.now ?? new Date().toISOString()
  const selfApprove = input.actorUserId === current.createdByUserId
  if (selfApprove) {
    const declaration = (input.selfApprovalDeclaration ?? '').trim()
    if (declaration.length < 8) {
      authorizationFail('AUTH_SELF_APPROVAL', '同一管理员自批必须填写确认声明')
    }
  }
  const nextStatus: InstrumentAuthorizationStatusV1 = current.evidenceAssetId
    ? 'APPROVED'
    : 'EVIDENCE_PENDING'
  const next = validateInstrumentAuthorizationRecord({
    ...current,
    status: nextStatus,
    selfApprovalDeclaration: selfApprove
      ? (input.selfApprovalDeclaration ?? '').trim()
      : current.selfApprovalDeclaration,
    approvedByUserId: input.actorUserId,
    approvedAt: now,
    updatedAt: now,
  })
  return {
    record: next,
    audit: appendAudit(next, 'APPROVE', input.actorUserId, selfApprove ? 'self-approve with declaration' : 'approve', now),
  }
}

/** Post-approval edits always mint a new version (append-only history). */
export const amendApprovedInstrumentAuthorization = (input: {
  previous: InstrumentAuthorizationRecordV1
  patch: Partial<Pick<InstrumentAuthorizationRecordV1, 'scope' | 'validFrom' | 'validTo' | 'basis' | 'grantor' | 'grantee'>>
  actorUserId: string
  now?: string
}): {
  record: InstrumentAuthorizationRecordV1
  audit: InstrumentAuthorizationAuditEventV1
} => {
  const previous = validateInstrumentAuthorizationRecord(input.previous)
  if (previous.status !== 'APPROVED' && previous.status !== 'EVIDENCE_PENDING') {
    authorizationFail('AUTH_STATE', '只有已批准记录的修改才出新版本')
  }
  const now = input.now ?? new Date().toISOString()
  const next = validateInstrumentAuthorizationRecord({
    ...previous,
    ...input.patch,
    scope: input.patch.scope
      ? {
          ...input.patch.scope,
          territories: [...input.patch.scope.territories],
          locales: [...input.patch.scope.locales],
        }
      : {
          ...previous.scope,
          territories: [...previous.scope.territories],
          locales: [...previous.scope.locales],
        },
    version: previous.version + 1,
    status: 'DRAFT',
    approvedByUserId: null,
    approvedAt: null,
    selfApprovalDeclaration: null,
    updatedAt: now,
  })
  return {
    record: next,
    audit: appendAudit(next, 'UPDATE', input.actorUserId, `amended from v${previous.version}`, now),
  }
}

export const revokeInstrumentAuthorization = (input: {
  record: InstrumentAuthorizationRecordV1
  actorUserId: string
  note: string
  now?: string
}): {
  record: InstrumentAuthorizationRecordV1
  audit: InstrumentAuthorizationAuditEventV1
} => {
  const current = validateInstrumentAuthorizationRecord(input.record)
  const now = input.now ?? new Date().toISOString()
  const next = validateInstrumentAuthorizationRecord({
    ...current,
    status: 'REVOKED',
    updatedAt: now,
  })
  return {
    record: next,
    audit: appendAudit(next, 'REVOKE', input.actorUserId, input.note, now),
  }
}

export const attachAuthorizationEvidence = (input: {
  record: InstrumentAuthorizationRecordV1
  evidenceAssetId: string
  evidenceSha256: string
  actorUserId: string
  now?: string
}): {
  record: InstrumentAuthorizationRecordV1
  audit: InstrumentAuthorizationAuditEventV1
} => {
  const current = validateInstrumentAuthorizationRecord(input.record)
  if (!HEX.test(input.evidenceSha256)) {
    authorizationFail('AUTH_EVIDENCE_INVALID', 'evidenceSha256 必须是 64 hex')
  }
  const now = input.now ?? new Date().toISOString()
  const nextStatus: InstrumentAuthorizationStatusV1 = (
    current.status === 'EVIDENCE_PENDING' || current.status === 'APPROVED'
      ? 'APPROVED'
      : current.status
  )
  const next = validateInstrumentAuthorizationRecord({
    ...current,
    evidenceAssetId: input.evidenceAssetId,
    evidenceSha256: input.evidenceSha256,
    status: nextStatus,
    updatedAt: now,
  })
  return {
    record: next,
    audit: appendAudit(next, 'ATTACH_EVIDENCE', input.actorUserId, 'evidence attached', now),
  }
}

export const sha256Hex = (bytes: Buffer | string): string => (
  createHash('sha256').update(bytes).digest('hex')
)


/**
 * Product revoke of the latest version must stop older APPROVED rows in the same
 * authorizationId lineage from remaining effective after amend → revoke-latest.
 * Returns revoked rows (newest first) + audits.
 */
export const revokeAuthorizationLineage = (input: {
  lineage: InstrumentAuthorizationRecordV1[]
  actorUserId: string
  note: string
  now?: string
}): {
  records: InstrumentAuthorizationRecordV1[]
  audits: InstrumentAuthorizationAuditEventV1[]
} => {
  const now = input.now ?? new Date().toISOString()
  const byVersion = [...input.lineage]
    .map((row) => validateInstrumentAuthorizationRecord(row))
    .sort((a, b) => b.version - a.version)
  if (byVersion.length === 0) {
    authorizationFail('AUTH_STATE', 'authorization lineage empty')
  }
  const authorizationId = byVersion[0]!.authorizationId
  for (const row of byVersion) {
    if (row.authorizationId !== authorizationId) {
      authorizationFail('AUTH_STATE', 'lineage must share authorizationId')
    }
  }
  const records: InstrumentAuthorizationRecordV1[] = []
  const audits: InstrumentAuthorizationAuditEventV1[] = []
  for (const row of byVersion) {
    if (row.status === 'REVOKED') {
      records.push(row)
      continue
    }
    // Revoke every non-REVOKED version so prior APPROVED cannot stay effective.
    const revoked = revokeInstrumentAuthorization({
      record: row,
      actorUserId: input.actorUserId,
      note: input.note,
      now,
    })
    records.push(revoked.record)
    audits.push(revoked.audit)
  }
  return { records, audits }
}
