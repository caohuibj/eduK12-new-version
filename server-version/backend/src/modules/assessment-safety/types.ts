/**
 * SafetyCase domain types — Commit 14.
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
  /** Dedup key: sourceKind + sourceHash + policyKey@version */
  idempotencyKey: string
  createdAt: string
  updatedAt: string
  acknowledgedAt: string | null
  disposedAt: string | null
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

export interface SafetyWakeupJobV1 {
  jobId: string
  caseId: string
  kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
  fireAt: string
  status: 'SCHEDULED' | 'FIRED' | 'CANCELLED'
}
