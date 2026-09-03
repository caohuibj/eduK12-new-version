export const INSTRUMENT_AUTHORIZATION_SCHEMA = 1 as const

export type InstrumentAuthorizationStatusV1 =
  | 'DRAFT'
  | 'APPROVED'
  | 'EVIDENCE_PENDING'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SCOPE_MISMATCH'

export type InstrumentCommercialNatureV1 = 'NON_COMMERCIAL' | 'COMMERCIAL' | 'UNSPECIFIED'

export type InstrumentAuthorizationActionV1 =
  | 'CREATE'
  | 'UPDATE'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REVOKE'
  | 'EXPIRE'
  | 'ATTACH_EVIDENCE'

export interface InstrumentAuthorizationScopeV1 {
  electronicAdministration: boolean
  scoring: boolean
  translation: boolean
  display: boolean
  territories: string[]
  locales: string[]
  commercialNature: InstrumentCommercialNatureV1
}

export interface InstrumentAuthorizationRecordV1 {
  schemaVersion: typeof INSTRUMENT_AUTHORIZATION_SCHEMA
  authorizationId: string
  version: number
  instrumentKey: string
  instrumentVersion: string
  grantor: string
  grantee: string
  scope: InstrumentAuthorizationScopeV1
  validFrom: string
  validTo: string
  basis: string
  status: InstrumentAuthorizationStatusV1
  evidenceAssetId: string | null
  evidenceSha256: string | null
  /** Required when the same admin both submits and approves. */
  selfApprovalDeclaration: string | null
  approvedByUserId: string | null
  approvedAt: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export interface InstrumentAuthorizationAuditEventV1 {
  auditId: string
  authorizationId: string
  authorizationVersion: number
  action: InstrumentAuthorizationActionV1
  actorUserId: string
  at: string
  note: string
  /** Append-only payload snapshot hash of the record after the action. */
  recordHash: string
}

export type PublicationGateIdV1 =
  | 'scientific'
  | 'rights'
  | 'language'
  | 'report'
  | 'safety'
  | 'golden'

export interface PublicationGateResultV1 {
  gate: PublicationGateIdV1
  ok: boolean
  severity: 'error' | 'warning'
  message: string
}

export interface PublicationDecisionV1 {
  publishable: boolean
  catalogStatus: 'PUBLISHED' | 'HOLD' | 'DRAFT'
  allowNewStarts: boolean
  warnings: string[]
  errors: string[]
  gates: PublicationGateResultV1[]
}

export interface AttemptDeadlinePolicyV1 {
  unitFamily: 'SCALE' | 'OBSERVER' | 'COGNITIVE' | 'INTEGRATED'
  defaultMaxMs: number
  frozenDeadlineAt: string
  campaignDeadlineAt: string | null
  effectiveDeadlineAt: string
}

export const SCALE_OBSERVER_DEFAULT_MAX_MS = 7 * 24 * 60 * 60 * 1000
export const COGNITIVE_INTEGRATED_DEFAULT_MAX_MS = 24 * 60 * 60 * 1000
