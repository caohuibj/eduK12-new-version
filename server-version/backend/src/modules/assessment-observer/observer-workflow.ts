/**
 * Commit 12 — teacher assign / parent self-serve / share / observer access.
 * Pure domain rules; no Prisma. No SELF/PARENT/TEACHER composite averages.
 */
import { randomUUID } from 'node:crypto'
import {
  AssessmentIdentityError,
  assertParentCanViewRespondentProjection,
  assertSubjectRespondentSeparation,
  createAttemptConsent,
  createEpisode,
  acceptPendingAttemptConsent,
} from '../assessment-identity'
import type { AssessmentAttemptConsentRecordV1 } from '../assessment-identity/types'
import type { ParentStudentRelationshipRecordV1 } from '../assessment-identity/types'
import { AssessmentObserverError, observerFail } from './errors'
import type {
  ObserverAssignmentRecordV1,
  ObserverAudienceProjectionRequestV1,
  ObserverBundleCatalogEntryV1,
  ObserverInitiationPathV1,
} from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

const assertPublishedParentSelfServe = (entry: ObserverBundleCatalogEntryV1): void => {
  if (entry.releaseStatus !== 'PUBLISHED') {
    observerFail('OBSERVER_CATALOG', '家长自助仅允许 PUBLISHED 目录条目')
  }
  if (entry.respondentType !== 'PARENT') {
    observerFail('OBSERVER_CATALOG', '家长自助仅适用于 PARENT respondent Bundle')
  }
  if (!entry.allowsParentSelfServe || !entry.initiationModes.includes('PARENT_SELF_SERVE')) {
    observerFail('OBSERVER_CATALOG', '该 Bundle 未开放家长自助')
  }
}

const assertActiveRelationship = (input: {
  relationship: ParentStudentRelationshipRecordV1
  parentUserId: string
  subjectUserId: string
}): void => {
  if (input.relationship.parentUserId !== input.parentUserId) {
    observerFail('OBSERVER_RELATIONSHIP', '非本关系家长')
  }
  if (input.relationship.studentUserId !== input.subjectUserId) {
    observerFail('OBSERVER_RELATIONSHIP', '孩子与关系不匹配')
  }
  if (input.relationship.status !== 'ACTIVE') {
    observerFail('OBSERVER_RELATIONSHIP', '仅 ACTIVE 亲子关系可发起或接收 observer 任务')
  }
}

const assertRosterTeacher = (input: {
  actorUserId: string
  actorRole: string
  courseCreatorUserId: string
  subjectOnRoster: boolean
}): void => {
  if (input.actorRole !== 'TEACHER' && input.actorRole !== 'ADMIN') {
    observerFail('OBSERVER_TEACHER', '只有教师或管理员可分配教师观察任务')
  }
  if (input.actorRole === 'TEACHER' && input.actorUserId !== input.courseCreatorUserId) {
    observerFail('OBSERVER_TEACHER', '教师只能为自己有有效 roster 权限的课程学生分配')
  }
  if (!input.subjectOnRoster) {
    observerFail('OBSERVER_ROSTER', '学生不在当前课程 roster')
  }
}

const buildAssignment = (input: {
  path: ObserverInitiationPathV1
  bundleKey: string
  bundleVersion: string
  episodeId: string
  subjectUserId: string
  respondentUserId: string
  respondentType: 'PARENT' | 'TEACHER'
  assignedByUserId: string
  courseId: string | null
  visibility: ObserverAssignmentRecordV1['visibility']
  shareTargets: string[]
  consentId: string
  now: string
}): ObserverAssignmentRecordV1 => {
  assertSubjectRespondentSeparation({
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
    respondentType: input.respondentType,
  })
  return {
    assignmentId: randomUUID(),
    path: input.path,
    bundleKey: input.bundleKey,
    bundleVersion: input.bundleVersion,
    episodeId: input.episodeId,
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
    respondentType: input.respondentType,
    assignedByUserId: input.assignedByUserId,
    courseId: input.courseId,
    visibility: input.visibility,
    shareTargets: [...input.shareTargets],
    consentId: input.consentId,
    createdAt: input.now,
    status: 'OPEN',
  }
}

/**
 * Path 1: Teacher assigns an independent observer task to an approved parent.
 * Visibility opens to assigning teacher (pre-consent captured on attempt consent).
 */
export type TeacherAssignObserverResultV1 = {
  episode: { episodeId: string; initiationMode: string; subjectUserId: string }
  /** Pending consent awaiting parent acceptance — acceptedAt is null. */
  consentRequired: AssessmentAttemptConsentRecordV1
  assignment: ObserverAssignmentRecordV1
}

export const teacherAssignObserverToParent = (input: {
  catalogEntry: ObserverBundleCatalogEntryV1
  teacherUserId: string
  teacherRole: string
  courseId: string
  courseCreatorUserId: string
  subjectUserId: string
  subjectOnRoster: boolean
  parentUserId: string
  relationship: ParentStudentRelationshipRecordV1
  consentVersion: string
  now?: string
}): TeacherAssignObserverResultV1 => {
  assertRosterTeacher({
    actorUserId: input.teacherUserId,
    actorRole: input.teacherRole,
    courseCreatorUserId: input.courseCreatorUserId,
    subjectOnRoster: input.subjectOnRoster,
  })
  assertActiveRelationship({
    relationship: input.relationship,
    parentUserId: input.parentUserId,
    subjectUserId: input.subjectUserId,
  })
  if (input.catalogEntry.respondentType !== 'PARENT') {
    observerFail('OBSERVER_CATALOG', '教师向家长分配需要 PARENT Bundle')
  }
  if (!input.catalogEntry.initiationModes.includes('TEACHER_ASSIGNMENT')) {
    observerFail('OBSERVER_CATALOG', '该 Bundle 未开放教师分配')
  }
  if (input.catalogEntry.releaseStatus !== 'PUBLISHED') {
    observerFail('OBSERVER_CATALOG', '只能分配 PUBLISHED observer Bundle')
  }
  const now = input.now ?? new Date().toISOString()
  if (!ISO.test(now)) observerFail('OBSERVER_DATETIME', 'now 必须是 UTC ISO')
  const episode = createEpisode({
    subjectUserId: input.subjectUserId,
    initiatedByUserId: input.teacherUserId,
    initiationMode: 'TEACHER_CAMPAIGN',
    courseId: input.courseId,
  })
  // Do NOT set parent acceptedAt=now — parent acceptance creates accepted consent later.
  const consentRequired = createAttemptConsent({
    subjectUserId: input.subjectUserId,
    respondentUserId: input.parentUserId,
    respondentType: 'PARENT',
    consentVersion: input.consentVersion,
    purpose: 'teacher_assigned_parent_observer',
    visibilityScope: 'ASSIGNING_TEACHER',
    shareTargets: [input.teacherUserId],
    pending: true,
    acceptedAt: null,
  })
  const assignment = buildAssignment({
    path: 'TEACHER_ASSIGN_PARENT',
    bundleKey: input.catalogEntry.bundleKey,
    bundleVersion: input.catalogEntry.bundleVersion,
    episodeId: episode.episodeId,
    subjectUserId: input.subjectUserId,
    respondentUserId: input.parentUserId,
    respondentType: 'PARENT',
    assignedByUserId: input.teacherUserId,
    courseId: input.courseId,
    visibility: 'ASSIGNING_TEACHER',
    shareTargets: [input.teacherUserId],
    consentId: consentRequired.consentId,
    now,
  })
  return {
    episode: {
      episodeId: episode.episodeId,
      initiationMode: episode.initiationMode,
      subjectUserId: input.subjectUserId,
    },
    consentRequired,
    assignment,
  }
}

export const parentAcceptTeacherAssignedConsent = (input: {
  consentRequired: AssessmentAttemptConsentRecordV1
  parentUserId: string
  now?: string
}): AssessmentAttemptConsentRecordV1 => {
  if (input.consentRequired.respondentUserId !== input.parentUserId) {
    observerFail('OBSERVER_CONSENT', '只有被分配家长可接受 consent')
  }
  if (input.consentRequired.acceptedAt) {
    observerFail('OBSERVER_CONSENT', 'consent 已接受')
  }
  return acceptPendingAttemptConsent({
    pending: input.consentRequired,
    acceptedAt: input.now ?? new Date().toISOString(),
  })
}

/**
 * Path 2: Parent self-serve from PUBLISHED catalog for a bound child.
 * Default visibility PRIVATE_RESPONDENT.
 */
export const parentSelfServeObserver = (input: {
  catalogEntry: ObserverBundleCatalogEntryV1
  parentUserId: string
  subjectUserId: string
  relationship: ParentStudentRelationshipRecordV1
  consentVersion: string
  now?: string
}): ObserverAssignmentRecordV1 => {
  assertPublishedParentSelfServe(input.catalogEntry)
  assertActiveRelationship({
    relationship: input.relationship,
    parentUserId: input.parentUserId,
    subjectUserId: input.subjectUserId,
  })
  const now = input.now ?? new Date().toISOString()
  const episode = createEpisode({
    subjectUserId: input.subjectUserId,
    initiatedByUserId: input.parentUserId,
    initiationMode: 'PARENT_SELF_SERVE',
    courseId: null,
  })
  const consent = createAttemptConsent({
    subjectUserId: input.subjectUserId,
    respondentUserId: input.parentUserId,
    respondentType: 'PARENT',
    consentVersion: input.consentVersion,
    purpose: 'parent_self_serve_observer',
    visibilityScope: 'PRIVATE_RESPONDENT',
    shareTargets: [],
    acceptedAt: now,
  })
  return buildAssignment({
    path: 'PARENT_SELF_SERVE',
    bundleKey: input.catalogEntry.bundleKey,
    bundleVersion: input.catalogEntry.bundleVersion,
    episodeId: episode.episodeId,
    subjectUserId: input.subjectUserId,
    respondentUserId: input.parentUserId,
    respondentType: 'PARENT',
    assignedByUserId: input.parentUserId,
    courseId: null,
    visibility: 'PRIVATE_RESPONDENT',
    shareTargets: [],
    consentId: consent.consentId,
    now,
  })
}

/**
 * Path 3: Teacher completes teacher-observer as respondent for a roster student.
 */
export const teacherSelfReportObserver = (input: {
  catalogEntry: ObserverBundleCatalogEntryV1
  teacherUserId: string
  teacherRole: string
  courseId: string
  courseCreatorUserId: string
  subjectUserId: string
  subjectOnRoster: boolean
  consentVersion: string
  now?: string
}): ObserverAssignmentRecordV1 => {
  assertRosterTeacher({
    actorUserId: input.teacherUserId,
    actorRole: input.teacherRole,
    courseCreatorUserId: input.courseCreatorUserId,
    subjectOnRoster: input.subjectOnRoster,
  })
  if (input.catalogEntry.respondentType !== 'TEACHER') {
    observerFail('OBSERVER_CATALOG', '教师自填需要 TEACHER respondent Bundle')
  }
  if (!input.catalogEntry.initiationModes.includes('TEACHER_ASSIGNMENT')) {
    observerFail('OBSERVER_CATALOG', '该 Bundle 未开放教师分配/自填')
  }
  if (input.catalogEntry.releaseStatus !== 'PUBLISHED') {
    observerFail('OBSERVER_CATALOG', '只能使用 PUBLISHED teacher observer Bundle')
  }
  const now = input.now ?? new Date().toISOString()
  const episode = createEpisode({
    subjectUserId: input.subjectUserId,
    initiatedByUserId: input.teacherUserId,
    initiationMode: 'TEACHER_CAMPAIGN',
    courseId: input.courseId,
  })
  const consent = createAttemptConsent({
    subjectUserId: input.subjectUserId,
    respondentUserId: input.teacherUserId,
    respondentType: 'TEACHER',
    consentVersion: input.consentVersion,
    purpose: 'teacher_self_report_observer',
    visibilityScope: 'ASSIGNING_TEACHER',
    shareTargets: [input.teacherUserId],
    acceptedAt: now,
  })
  return buildAssignment({
    path: 'TEACHER_SELF_REPORT',
    bundleKey: input.catalogEntry.bundleKey,
    bundleVersion: input.catalogEntry.bundleVersion,
    episodeId: episode.episodeId,
    subjectUserId: input.subjectUserId,
    respondentUserId: input.teacherUserId,
    respondentType: 'TEACHER',
    assignedByUserId: input.teacherUserId,
    courseId: input.courseId,
    visibility: 'ASSIGNING_TEACHER',
    shareTargets: [input.teacherUserId],
    consentId: consent.consentId,
    now,
  })
}

/**
 * Path 4: Parent explicitly shares a private self-serve result with the current
 * authorized course lead (teacher). Does not grant access to other parents or
 * child self-report / cross-informant composites.
 */
export type ParentShareResultV1 = {
  /** Prior private assignment retained (append-only history). */
  previousAssignment: ObserverAssignmentRecordV1
  assignment: ObserverAssignmentRecordV1
  /** New share consent version — do not keep PRIVATE consentId while mutating visibility. */
  shareConsent: AssessmentAttemptConsentRecordV1
}

export const parentShareSelfServeToCourseLead = (input: {
  assignment: ObserverAssignmentRecordV1
  parentUserId: string
  courseLeadUserId: string
  courseLeadIsAuthorizedForSubject: boolean
  consentVersion: string
  now?: string
}): ParentShareResultV1 => {
  if (input.assignment.path !== 'PARENT_SELF_SERVE') {
    observerFail('OBSERVER_SHARE', '仅家长自助结果可显式分享给课程负责人')
  }
  if (input.assignment.respondentUserId !== input.parentUserId) {
    observerFail('OBSERVER_SHARE', '只有作答家长本人可分享')
  }
  if (input.assignment.status === 'REVOKED') {
    observerFail('OBSERVER_SHARE', '已撤销任务不可分享')
  }
  if (!input.courseLeadIsAuthorizedForSubject) {
    observerFail('OBSERVER_SHARE', '目标教师当前对该学生无有效课程权限')
  }
  const now = input.now ?? new Date().toISOString()
  const shareTargets = Array.from(new Set([...input.assignment.shareTargets, input.courseLeadUserId]))
  const shareConsent = createAttemptConsent({
    subjectUserId: input.assignment.subjectUserId,
    respondentUserId: input.parentUserId,
    respondentType: 'PARENT',
    consentVersion: input.consentVersion,
    purpose: 'parent_share_to_course_lead',
    visibilityScope: 'SHARED_COURSE_LEAD',
    shareTargets,
    acceptedAt: now,
  })
  const assignment: ObserverAssignmentRecordV1 = {
    ...input.assignment,
    assignmentId: randomUUID(),
    visibility: 'SHARED_COURSE_LEAD',
    shareTargets,
    consentId: shareConsent.consentId,
    courseId: input.assignment.courseId,
    createdAt: now,
    path: 'PARENT_SHARE_TO_COURSE_LEAD',
  }
  return {
    previousAssignment: input.assignment,
    assignment,
    shareConsent,
  }
}

/**
 * Parent may only view own respondent projection — never child self-report,
 * other parents, teacher raw answers, or cross-informant reports.
 */
/** Allowlist-only observer projection fields — never recursive blacklist on arbitrary Record. */
export const OBSERVER_PROJECTION_ALLOWLIST = [
  'bundleKey',
  'bundleVersion',
  'quality',
  'scores',
  'engineSummary',
  'limitations',
  'recommendations',
  'identity',
  'audience',
] as const

export const projectObserverForViewer = (
  input: ObserverAudienceProjectionRequestV1 & {
    relationship?: ParentStudentRelationshipRecordV1 | null
    allowlistKeys?: readonly string[]
  },
): Record<string, unknown> => {
  const allow = new Set(input.allowlistKeys ?? OBSERVER_PROJECTION_ALLOWLIST)
  const scrubbed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.respondentProjection)) {
    if (!allow.has(key)) {
      observerFail('OBSERVER_LEAK', `投影字段不在 allowlist: ${key}`)
    }
    scrubbed[key] = value
  }

  const { assignment, viewerUserId, viewerRole } = input

  if (viewerRole === 'PARENT') {
    const relationship = input.relationship
    if (!relationship) {
      throw new AssessmentObserverError('OBSERVER_VIEW', '家长查看需要有效亲子关系')
    }
    try {
      assertParentCanViewRespondentProjection({
        relationship,
        parentUserId: viewerUserId,
        respondentUserId: assignment.respondentUserId,
        subjectUserId: assignment.subjectUserId,
      })
    } catch (error) {
      if (error instanceof AssessmentIdentityError) {
        observerFail('OBSERVER_VIEW', error.message)
      }
      throw error
    }
    if (assignment.respondentUserId !== viewerUserId) {
      observerFail('OBSERVER_VIEW', '家长只能查看自己作为 respondent 的投影')
    }
    if (relationship.studentUserId !== assignment.subjectUserId) {
      observerFail('OBSERVER_VIEW', 'relationship.studentUserId 必须等于 assignment.subjectUserId')
    }
    return { ...scrubbed, audience: 'parent_respondent' }
  }

  if (viewerRole === 'TEACHER' || viewerRole === 'ADMIN') {
    const allowed = (
      assignment.visibility === 'ASSIGNING_TEACHER'
      || assignment.visibility === 'SHARED_COURSE_LEAD'
    ) && (
      assignment.shareTargets.includes(viewerUserId)
      || assignment.assignedByUserId === viewerUserId
      || viewerRole === 'ADMIN'
    )
    if (!allowed) {
      observerFail('OBSERVER_VIEW', '教师无权查看该 observer 投影（默认私有或未分享）')
    }
    return { ...scrubbed, audience: 'teacher_shared' }
  }

  return observerFail('OBSERVER_VIEW', '学生或其他角色不得查看 observer 投影')
}

/** Explicit refusal helpers for the four forbidden cross-views. */
export const assertCannotViewChildSelfReport = (viewerRole: string): void => {
  if (viewerRole === 'PARENT') {
    observerFail('OBSERVER_FORBIDDEN_VIEW', '家长不得查看孩子自评')
  }
}

export const assertCannotViewOtherParent = (input: {
  viewerParentUserId: string
  otherParentRespondentUserId: string
}): void => {
  if (input.viewerParentUserId !== input.otherParentRespondentUserId) {
    observerFail('OBSERVER_FORBIDDEN_VIEW', '家长不得查看其他家长的观察结果')
  }
}

export const assertCannotViewTeacherRawAnswers = (): void => {
  observerFail('OBSERVER_FORBIDDEN_VIEW', '不得查看教师原始答案')
}

export const assertCannotViewCrossInformantReport = (): void => {
  observerFail('OBSERVER_FORBIDDEN_VIEW', '本 PR 不提供跨 informant 综合报告或平均分')
}

export const listParentSelfServeCatalog = (
  entries: ObserverBundleCatalogEntryV1[],
): ObserverBundleCatalogEntryV1[] => (
  entries.filter((entry) => (
    entry.releaseStatus === 'PUBLISHED'
    && entry.respondentType === 'PARENT'
    && entry.allowsParentSelfServe
    && entry.initiationModes.includes('PARENT_SELF_SERVE')
  ))
)

/**
 * Gate attempt start / FINAL submit for teacher-assigned observer paths.
 * Pending parent consent (acceptedAt == null) forbids start and FINAL submit.
 * Authoritative: callers must pass the current consent record.
 */
export const assertTeacherAssignedConsentAcceptedForAttempt = (input: {
  consent: AssessmentAttemptConsentRecordV1
  action: 'START' | 'FINAL_SUBMIT'
}): void => {
  if (input.consent.purpose !== 'teacher_assigned_parent_observer') {
    return
  }
  if (!input.consent.acceptedAt) {
    observerFail(
      'OBSERVER_CONSENT_PENDING',
      input.action === 'START'
        ? 'pending teacher-assigned consent: attempt start forbidden until parent accepts'
        : 'pending teacher-assigned consent: FINAL submit forbidden until parent accepts',
    )
  }
  if (input.consent.revokedAt) {
    observerFail('OBSERVER_CONSENT', 'consent revoked')
  }
}

export const canStartTeacherAssignedObserverAttempt = (
  consent: AssessmentAttemptConsentRecordV1,
): boolean => {
  try {
    assertTeacherAssignedConsentAcceptedForAttempt({ consent, action: 'START' })
    return true
  } catch {
    return false
  }
}

export const canFinalSubmitTeacherAssignedObserverAttempt = (
  consent: AssessmentAttemptConsentRecordV1,
): boolean => {
  try {
    assertTeacherAssignedConsentAcceptedForAttempt({ consent, action: 'FINAL_SUBMIT' })
    return true
  } catch {
    return false
  }
}
