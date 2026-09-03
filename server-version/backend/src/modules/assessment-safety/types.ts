/**
 * SafetyCase domain types — Commit 14 / Prep 15.1.
 * Safety consumes CanonicalUnitResult / BundleReportFacts / CompositeAnalysisSnapshot only.
 * Never raw answers/trials. No email/SMS. No LLM.
 */

export type SafetyPolicyStatusV1 = 'DRAFT' | 'APPROVED' | 'RETIRED'

export type SafetyCaseStatusV1 =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ESCALATED'
  | 'DISPOSED'
  | 'REFERRED'

export type SafetyCaseEventTypeV1 =
  | 'CREATED'
  | 'ACKNOWLEDGED'
  | 'ACTION_RECORDED'
  | 'ESCALATED'
  | 'DISPOSED'
  | 'REFERRED'
  | 'WAKEUP_SCHEDULED'
  | 'WAKEUP_FIRED'
  | 'RECONCILED'
  | 'WAKEUP_DUPLICATE_NOOP'

/** Authoritative trigger sources only — never raw answers. */
export type SafetyTriggerSourceKindV1 =
  | 'BUNDLE_REPORT_FACTS'
  | 'CANONICAL_UNIT_RESULT'
  | 'COMPOSITE_ANALYSIS_SNAPSHOT'

export interface SafetyPolicyTemplateV1 {
  schemaVersion: 1
  policyKey: string
  policyVersion: string
  status: SafetyPolicyStatusV1
  name: string
  /** Milliseconds allowed before acknowledgment timeout escalation. */
  acknowledgeWithinMs: number
  /** Milliseconds allowed before dispose timeout escalation. */
  disposeWithinMs: number
  escalationChain: string[]
  /** When false, evaluateSafetyTrigger always returns null (production Bundles). */
  productionTriggerEnabled: boolean
  /** Test-only fixture marker — first production Bundles must not trigger. */
  testOnlyAuthoritativeFixture: boolean
  createdByUserId: string
  approvedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface SafetyTriggerSignalV1 {
  sourceKind: SafetyTriggerSourceKindV1
  /** Hash of authoritative facts/snapshot/result — never raw payload. */
  sourceHash: string
  bundleKey: string | null
  bundleVersion: string | null
  /**
   * Analysis-instance / source-record identity. Same content hash across
   * subjects or reanalyses must NOT collide — include subject-bound id.
   */
  sourceRecordId: string | null
  /** Explicit safety role evidence or test fixture flag. */
  safetyFlag: boolean
  notes: string[]
}

export interface SafetyCaseRecordV1 {
  schemaVersion: 1
  caseId: string
  policyKey: string
  policyVersion: string
  status: SafetyCaseStatusV1
  subjectUserId: string
  primaryOwnerUserId: string
  backupOwnerUserIds: string[]
  trigger: SafetyTriggerSignalV1
  /**
   * Dedup key: subject + sourceKind + sourceHash + sourceRecordId + policyKey@version.
   * Same hash reanalysis with different analysis instance → new case.
   */
  idempotencyKey: string
  createdAt: string
  updatedAt: string
  acknowledgedAt: string | null
  disposedAt: string | null
  /** Persisted SLA deadlines from createdAt — restart must not slide these. */
  ackDueAt: string
  disposeDueAt: string
  /** Prior case this reanalysis must NOT auto-close. */
  priorCaseId: string | null
}

export interface SafetyCaseEventV1 {
  eventId: string
  caseId: string
  type: SafetyCaseEventTypeV1
  actorUserId: string
  at: string
  note: string
  /** Wake-up job id when applicable — DB remains authority. */
  wakeupJobId: string | null
}

/**
 * Bull payload is ID-only. Worker must load SafetyCase from Postgres —
 * never trust an embedded SafetyCaseRecord from the job.
 */
export interface SafetyWakeupBullPayloadV1 {
  caseId: string
  wakeupJobId: string
  kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
}

export interface SafetyWakeupJobV1 {
  jobId: string
  caseId: string
  kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
  fireAt: string
  status: 'SCHEDULED' | 'FIRED' | 'CANCELLED' | 'DUPLICATE_NOOP' | 'TOO_EARLY'
}

/** Durable wakeup ledger row — wakeupJobId is unique; UNIQUE(caseId, kind) one ACK + one DISPOSE. */
export interface SafetyWakeupLedgerEntryV1 {
  wakeupJobId: string
  caseId: string
  kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
  fireAt: string
  status: 'SCHEDULED' | 'FIRED' | 'CANCELLED' | 'DUPLICATE_NOOP'
  createdAt: string
  processedAt: string | null
}
