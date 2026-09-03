import { z } from 'zod'
import { authorizationFail } from './errors'
import {
  INSTRUMENT_AUTHORIZATION_SCHEMA,
  type InstrumentAuthorizationAuditEventV1,
  type InstrumentAuthorizationRecordV1,
} from './types'

const HEX = /^[0-9a-f]{64}$/
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/
const exactVersion = /^[0-9]+\.[0-9]+\.[0-9]+$/

const scopeSchema = z.object({
  electronicAdministration: z.boolean(),
  scoring: z.boolean(),
  translation: z.boolean(),
  display: z.boolean(),
  territories: z.array(z.string().min(1)).min(1),
  locales: z.array(z.string().min(1)).min(1),
  commercialNature: z.enum(['NON_COMMERCIAL', 'COMMERCIAL', 'UNSPECIFIED']),
}).strict()

export const instrumentAuthorizationRecordSchema = z.object({
  schemaVersion: z.literal(INSTRUMENT_AUTHORIZATION_SCHEMA),
  authorizationId: z.string().uuid(),
  version: z.number().int().positive(),
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().regex(exactVersion),
  grantor: z.string().min(1),
  grantee: z.string().min(1),
  scope: scopeSchema,
  validFrom: z.string().regex(ISO),
  validTo: z.string().regex(ISO),
  basis: z.string().min(1),
  status: z.enum(['DRAFT', 'APPROVED', 'EVIDENCE_PENDING', 'EXPIRED', 'REVOKED', 'SCOPE_MISMATCH']),
  evidenceAssetId: z.string().min(1).nullable(),
  evidenceSha256: z.string().regex(HEX).nullable(),
  selfApprovalDeclaration: z.string().min(1).nullable(),
  approvedByUserId: z.string().min(1).nullable(),
  approvedAt: z.string().regex(ISO).nullable(),
  createdByUserId: z.string().min(1),
  createdAt: z.string().regex(ISO),
  updatedAt: z.string().regex(ISO),
}).strict().superRefine((record, ctx) => {
  if (Date.parse(record.validTo) <= Date.parse(record.validFrom)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validTo 必须晚于 validFrom', path: ['validTo'] })
  }
  const hasAsset = record.evidenceAssetId !== null
  const hasSha = record.evidenceSha256 !== null
  if (hasAsset !== hasSha) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'evidenceAssetId 与 evidenceSha256 必须同时存在或同时为空',
      path: ['evidenceAssetId'],
    })
  }
})

export const instrumentAuthorizationAuditSchema = z.object({
  auditId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  authorizationVersion: z.number().int().positive(),
  action: z.enum(['CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REVOKE', 'EXPIRE', 'ATTACH_EVIDENCE']),
  actorUserId: z.string().min(1),
  at: z.string().regex(ISO),
  note: z.string(),
  recordHash: z.string().regex(HEX),
}).strict()

export const parseInstrumentAuthorizationRecord = (
  value: unknown,
): InstrumentAuthorizationRecordV1 => {
  const parsed = instrumentAuthorizationRecordSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    return authorizationFail('AUTH_RECORD_INVALID', `${path}${issue?.message ?? 'record invalid'}`)
  }
  return parsed.data as InstrumentAuthorizationRecordV1
}

export const parseInstrumentAuthorizationAudit = (
  value: unknown,
): InstrumentAuthorizationAuditEventV1 => {
  const parsed = instrumentAuthorizationAuditSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    return authorizationFail('AUTH_RECORD_INVALID', `${path}${issue?.message ?? 'audit invalid'}`)
  }
  return parsed.data as InstrumentAuthorizationAuditEventV1
}
