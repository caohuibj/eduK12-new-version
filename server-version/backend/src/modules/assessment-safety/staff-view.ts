/**
 * Staff UI projection helpers — internal case only for primary/backup/admin.
 * Students/parents never see case internals; only audited report guidance.
 */
import { assertCanViewSafetyCase } from './case'
import type { SafetyCaseEventV1, SafetyCaseRecordV1 } from './types'

export interface SafetyStaffCaseViewV1 {
  caseId: string
  status: SafetyCaseRecordV1['status']
  subjectUserId: string
  primaryOwnerUserId: string
  backupOwnerUserIds: string[]
  policyKey: string
  policyVersion: string
  triggerSourceKind: SafetyCaseRecordV1['trigger']['sourceKind']
  triggerSourceHash: string
  createdAt: string
  acknowledgedAt: string | null
  disposedAt: string | null
  events: Array<{
    eventId: string
    type: SafetyCaseEventV1['type']
    actorUserId: string
    at: string
    note: string
  }>
}

export const projectSafetyStaffView = (input: {
  safetyCase: SafetyCaseRecordV1
  events: SafetyCaseEventV1[]
  viewerUserId: string
  isAuthorizedAdmin: boolean
}): SafetyStaffCaseViewV1 => {
  assertCanViewSafetyCase({
    safetyCase: input.safetyCase,
    viewerUserId: input.viewerUserId,
    viewerRole: input.isAuthorizedAdmin ? 'ADMIN' : 'STAFF',
    isAuthorizedAdmin: input.isAuthorizedAdmin,
  })
  return {
    caseId: input.safetyCase.caseId,
    status: input.safetyCase.status,
    subjectUserId: input.safetyCase.subjectUserId,
    primaryOwnerUserId: input.safetyCase.primaryOwnerUserId,
    backupOwnerUserIds: [...input.safetyCase.backupOwnerUserIds],
    policyKey: input.safetyCase.policyKey,
    policyVersion: input.safetyCase.policyVersion,
    triggerSourceKind: input.safetyCase.trigger.sourceKind,
    triggerSourceHash: input.safetyCase.trigger.sourceHash,
    createdAt: input.safetyCase.createdAt,
    acknowledgedAt: input.safetyCase.acknowledgedAt,
    disposedAt: input.safetyCase.disposedAt,
    events: input.events.map((event) => ({
      eventId: event.eventId,
      type: event.type,
      actorUserId: event.actorUserId,
      at: event.at,
      note: event.note,
    })),
  }
}

/** Parent/student facing guidance — never exposes case internals. */
export const projectSafetySubjectGuidance = (): {
  audience: 'subject_or_parent'
  guidance: string
  caseVisible: false
} => ({
  audience: 'subject_or_parent',
  guidance: '如需支持，请按报告中的审核后指引联系课程负责人或学校支持人员。',
  caseVisible: false,
})
