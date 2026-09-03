import { describe, expect, it } from 'vitest'
import {
  AssessmentObserverError,
  assertCannotViewChildSelfReport,
  assertCannotViewCrossInformantReport,
  assertCannotViewOtherParent,
  assertCannotViewTeacherRawAnswers,
  listParentSelfServeCatalog,
  parentSelfServeObserver,
  parentShareSelfServeToCourseLead,
  projectObserverForViewer,
  teacherAssignObserverToParent,
  teacherSelfReportObserver,
  type ObserverBundleCatalogEntryV1,
} from '../../modules/assessment-observer'
import {
  approveParentRelationship,
  createPendingParentRelationship,
} from '../../modules/assessment-identity'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected AssessmentObserverError')
  } catch (error) {
    if (error instanceof AssessmentObserverError) return error.code
    throw error
  }
}

const parentCatalog: ObserverBundleCatalogEntryV1 = {
  bundleKey: 'sdq_parent_observer_zh_cn_v1',
  bundleVersion: '1.0.0',
  name: 'SDQ parent',
  respondentType: 'PARENT',
  initiationModes: ['TEACHER_ASSIGNMENT', 'PARENT_SELF_SERVE'],
  allowsParentSelfServe: true,
  releaseStatus: 'PUBLISHED',
  subjectMinAgeYears: 4,
  subjectMaxAgeYears: 17,
}

const teacherCatalog: ObserverBundleCatalogEntryV1 = {
  bundleKey: 'sdq_teacher_observer_zh_cn_v1',
  bundleVersion: '1.0.0',
  name: 'SDQ teacher',
  respondentType: 'TEACHER',
  initiationModes: ['TEACHER_ASSIGNMENT'],
  allowsParentSelfServe: false,
  releaseStatus: 'PUBLISHED',
  subjectMinAgeYears: 4,
  subjectMaxAgeYears: 10,
}

const activeRelationship = () => {
  const pending = createPendingParentRelationship({
    parentUserId: 'parent-1',
    studentUserId: 'student-1',
    inviteCodeId: 'invite-1',
  })
  return approveParentRelationship({
    relationship: pending,
    actorUserId: 'teacher-1',
    actorRole: 'TEACHER',
    inviteCourseCreatorUserId: 'teacher-1',
    consentVersion: 'rel-consent-1',
    consentHash: 'a'.repeat(64),
  })
}

describe('observer assignment / self-serve / share / projection', () => {
  it('covers four observer paths without cross-informant averages', () => {
    const relationship = activeRelationship()

    const assigned = teacherAssignObserverToParent({
      catalogEntry: parentCatalog,
      teacherUserId: 'teacher-1',
      teacherRole: 'TEACHER',
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      subjectUserId: 'student-1',
      subjectOnRoster: true,
      parentUserId: 'parent-1',
      relationship,
      consentVersion: 'attempt-v1',
    })
    expect(assigned.path).toBe('TEACHER_ASSIGN_PARENT')
    expect(assigned.respondentType).toBe('PARENT')
    expect(assigned.visibility).toBe('ASSIGNING_TEACHER')
    expect(assigned.subjectUserId).not.toBe(assigned.respondentUserId)

    const selfServe = parentSelfServeObserver({
      catalogEntry: parentCatalog,
      parentUserId: 'parent-1',
      subjectUserId: 'student-1',
      relationship,
      consentVersion: 'attempt-v1',
    })
    expect(selfServe.path).toBe('PARENT_SELF_SERVE')
    expect(selfServe.visibility).toBe('PRIVATE_RESPONDENT')
    expect(selfServe.shareTargets).toEqual([])

    const teacherReport = teacherSelfReportObserver({
      catalogEntry: teacherCatalog,
      teacherUserId: 'teacher-1',
      teacherRole: 'TEACHER',
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      subjectUserId: 'student-1',
      subjectOnRoster: true,
      consentVersion: 'attempt-v1',
    })
    expect(teacherReport.path).toBe('TEACHER_SELF_REPORT')
    expect(teacherReport.respondentType).toBe('TEACHER')

    const shared = parentShareSelfServeToCourseLead({
      assignment: selfServe,
      parentUserId: 'parent-1',
      courseLeadUserId: 'teacher-1',
      courseLeadIsAuthorizedForSubject: true,
    })
    expect(shared.visibility).toBe('SHARED_COURSE_LEAD')
    expect(shared.shareTargets).toContain('teacher-1')
  })

  it('filters parent self-serve catalog to PUBLISHED parent-capable entries', () => {
    const listed = listParentSelfServeCatalog([
      parentCatalog,
      teacherCatalog,
      { ...parentCatalog, bundleKey: 'draft', releaseStatus: 'DRAFT' },
      { ...parentCatalog, bundleKey: 'no-flag', allowsParentSelfServe: false },
    ])
    expect(listed.map((row) => row.bundleKey)).toEqual(['sdq_parent_observer_zh_cn_v1'])
  })

  it('lets parent see only own respondent projection and blocks leaks', () => {
    const relationship = activeRelationship()
    const selfServe = parentSelfServeObserver({
      catalogEntry: parentCatalog,
      parentUserId: 'parent-1',
      subjectUserId: 'student-1',
      relationship,
      consentVersion: 'attempt-v1',
    })

    const view = projectObserverForViewer({
      viewerUserId: 'parent-1',
      viewerRole: 'PARENT',
      assignment: selfServe,
      relationship,
      respondentProjection: { summary: 'ok', total: 12 },
    })
    expect(view.audience).toBe('parent_respondent')

    expect(failCode(() => projectObserverForViewer({
      viewerUserId: 'parent-2',
      viewerRole: 'PARENT',
      assignment: selfServe,
      relationship,
      respondentProjection: { summary: 'ok' },
    }))).toBe('OBSERVER_VIEW')

    expect(failCode(() => projectObserverForViewer({
      viewerUserId: 'teacher-2',
      viewerRole: 'TEACHER',
      assignment: selfServe,
      respondentProjection: { summary: 'private' },
    }))).toBe('OBSERVER_VIEW')

    expect(failCode(() => projectObserverForViewer({
      viewerUserId: 'parent-1',
      viewerRole: 'PARENT',
      assignment: selfServe,
      relationship,
      respondentProjection: { rawAnswers: { a: 1 } },
    }))).toBe('OBSERVER_LEAK')

    expect(failCode(() => assertCannotViewChildSelfReport('PARENT'))).toBe('OBSERVER_FORBIDDEN_VIEW')
    expect(failCode(() => assertCannotViewOtherParent({
      viewerParentUserId: 'parent-1',
      otherParentRespondentUserId: 'parent-2',
    }))).toBe('OBSERVER_FORBIDDEN_VIEW')
    expect(failCode(() => assertCannotViewTeacherRawAnswers())).toBe('OBSERVER_FORBIDDEN_VIEW')
    expect(failCode(() => assertCannotViewCrossInformantReport())).toBe('OBSERVER_FORBIDDEN_VIEW')
  })

  it('rejects wrong teacher assignment and draft catalog self-serve', () => {
    const relationship = activeRelationship()
    expect(failCode(() => teacherAssignObserverToParent({
      catalogEntry: parentCatalog,
      teacherUserId: 'teacher-2',
      teacherRole: 'TEACHER',
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      subjectUserId: 'student-1',
      subjectOnRoster: true,
      parentUserId: 'parent-1',
      relationship,
      consentVersion: 'attempt-v1',
    }))).toBe('OBSERVER_TEACHER')

    expect(failCode(() => parentSelfServeObserver({
      catalogEntry: { ...parentCatalog, releaseStatus: 'DRAFT' },
      parentUserId: 'parent-1',
      subjectUserId: 'student-1',
      relationship,
      consentVersion: 'attempt-v1',
    }))).toBe('OBSERVER_CATALOG')

    expect(failCode(() => parentShareSelfServeToCourseLead({
      assignment: teacherAssignObserverToParent({
        catalogEntry: parentCatalog,
        teacherUserId: 'teacher-1',
        teacherRole: 'TEACHER',
        courseId: 'course-1',
        courseCreatorUserId: 'teacher-1',
        subjectUserId: 'student-1',
        subjectOnRoster: true,
        parentUserId: 'parent-1',
        relationship,
        consentVersion: 'attempt-v1',
      }),
      parentUserId: 'parent-1',
      courseLeadUserId: 'teacher-1',
      courseLeadIsAuthorizedForSubject: true,
    }))).toBe('OBSERVER_SHARE')
  })
})
