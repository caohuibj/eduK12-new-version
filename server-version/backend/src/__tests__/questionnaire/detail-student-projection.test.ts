import { beforeEach, describe, expect, it, vi } from 'vitest'
import { questionnaireController } from '../../controllers/questionnaireController'
import { questionnaireAuthorizationService } from '../../services/questionnaireAuthorizationService'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'

const mocks = vi.hoisted(() => ({
  questionnaire: vi.fn(), membership: vi.fn(), sections: vi.fn(), formSections: vi.fn(), units: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: {
  questionnaire: { findFirst: mocks.questionnaire },
  courseStudent: { findFirst: mocks.membership },
} }))
vi.mock('../../services/questionnaire-form-section.service', () => ({
  readQuestionnaireFormSections: mocks.sections,
  listQuestionnaireFormSections: mocks.formSections,
  listQuestionnaireContentUnits: mocks.units,
}))

type Membership = { studentId: string; courseId: string; status: string }
const courses = ['a', 'b', 'pending', 'removed'].map(suffix => ({
  id: `course-${suffix}`, title: `Synthetic cohort ${suffix}`, courseCode: `SYNTHETIC_CREDENTIAL_${suffix}`,
}))
const sections = [{ id: 'section', title: 'Synthetic form', position: 0, items: [{ id: 'field', label: 'Prompt' }] }]
const units = [{ type: 'form-section', id: 'section', label: 'Synthetic form', position: 0, itemCount: 1 }]
const makeQuestionnaire = (overrides: Record<string, unknown> = {}) => ({
  id: 'questionnaire', code: 'synthetic-questionnaire', name: 'Synthetic shared questionnaire',
  description: 'Synthetic description', instruction: 'Synthetic participation instructions',
  status: 'PUBLISHED', type: 'COURSE', visibility: 'COURSE', estimatedTime: 5, tags: ['synthetic'],
  creatorId: 'owner', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
  creator: { id: 'owner', username: 'synthetic-owner', nickname: 'Synthetic owner' },
  questionnaireScales: [{ id: 'scale-link', questionnaireId: 'questionnaire', scaleId: 'scale', position: 1,
    scale: { id: 'scale', code: 'synthetic-scale', name: 'Synthetic scale', status: 'PUBLISHED',
      instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0', definition: scaleDefinitionFor(1, 'Detail') } }],
  courseQuestionnaires: courses.map(course => ({
    id: `link-${course.id}`, questionnaireId: 'questionnaire', courseId: course.id, course,
  })),
  _count: { assessments: 3 },
  ...overrides,
})
let questionnaire: ReturnType<typeof makeQuestionnaire>
let memberships: Membership[]

const matchesMembership = (where: any, row: Membership) => row.studentId === where.studentId
  && where.status.in.includes(row.status)
  && (typeof where.courseId === 'string' ? row.courseId === where.courseId : where.courseId.in.includes(row.courseId))

beforeEach(() => {
  vi.resetAllMocks()
  questionnaire = makeQuestionnaire()
  memberships = [
    { studentId: 'student', courseId: 'course-a', status: 'ACTIVE' },
    { studentId: 'student', courseId: 'course-pending', status: 'PENDING' },
    { studentId: 'student', courseId: 'course-removed', status: 'REMOVED' },
    { studentId: 'another-student', courseId: 'course-b', status: 'ACTIVE' },
  ]
  // Apply the real ORM relation filter and projection to the synthetic rows.
  // The authorization service remains real and reads the same memberships.
  mocks.questionnaire.mockImplementation(async ({ where, include }) => {
    if (where.id !== questionnaire.id || where.type !== questionnaire.type) return null
    const linked = include.courseQuestionnaires
    const membership = linked.where?.course.students.some
    const links = questionnaire.courseQuestionnaires.filter(link => !membership || memberships.some(row =>
      row.courseId === link.courseId && matchesMembership({ ...membership, courseId: link.courseId }, row)))
    return { ...questionnaire, courseQuestionnaires: links.map(link => ({ ...link,
      course: Object.fromEntries(Object.entries(link.course).filter(([key]) => linked.include.course.select[key])),
    })) }
  })
  mocks.membership.mockImplementation(async ({ where }) => memberships.find(row => matchesMembership(where, row)) ?? null)
  mocks.sections.mockResolvedValue(sections)
  mocks.formSections.mockResolvedValue(sections)
  mocks.units.mockResolvedValue(units)
})

async function detail(userId = 'student', role = 'STUDENT', id = 'questionnaire') {
  const res: any = { statusCode: 200 }
  res.status = (status: number) => { res.statusCode = status; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  await questionnaireController.detail({ params: { id }, user: { userId, role } } as any, res)
  return res
}

function expectSafeCourseSummaries(data: any, expectedCourses: string[]) {
  expect(data.courseQuestionnaires).toEqual(expectedCourses.map(id => ({
    courseId: id, course: { id, title: courses.find(course => course.id === id)!.title },
  })))
  expect(JSON.stringify(data)).not.toContain('courseCode')
  for (const course of courses) expect(JSON.stringify(data)).not.toContain(course.courseCode)
}

describe('student questionnaire course summaries', () => {
  it.each(['ACTIVE', 'APPROVED'])('returns only the student’s %s linked cohort without enrollment credentials', async status => {
    memberships[0].status = status
    const res = await detail()
    expect(res.statusCode).toBe(200)
    expect(res.body.code).toBe(0)
    expectSafeCourseSummaries(res.body.data, ['course-a'])
    expect(mocks.questionnaire.mock.calls[0][0].include.courseQuestionnaires.include.course.select.courseCode).toBe(false)
    expect(res.body.data).toMatchObject({
      id: 'questionnaire', name: questionnaire.name, instruction: questionnaire.instruction,
      deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, formSections: sections, units,
      questionnaireScales: [{ id: 'scale-link', scaleId: 'scale', position: 1,
        scale: { id: 'scale', name: 'Synthetic scale', definition: { schemaVersion: 2 } } }],
    })
    expect(res.body.data.questionnaireScales[0].scale.definition).not.toHaveProperty('scoring')
  })

  it('keeps public participation readable without exposing any courses to a student with no memberships', async () => {
    questionnaire.visibility = 'PUBLIC'
    const res = await detail('unaffiliated-student')
    expect(res.statusCode).toBe(200)
    expect(res.body.code).toBe(0)
    expectSafeCourseSummaries(res.body.data, [])
    expect(res.body.data).toMatchObject({
      id: 'questionnaire', instruction: questionnaire.instruction,
      deliveryMode: 'FINAL_ONLY', formSections: sections, units,
    })
    await expect(questionnaireAuthorizationService.canTake({ userId: 'unaffiliated-student', role: 'STUDENT' }, questionnaire as any)).resolves.toBe(true)
  })

  it('limits public questionnaire summaries to the student’s own active linked courses', async () => {
    questionnaire.visibility = 'PUBLIC'
    const res = await detail()
    expect(res.body.code).toBe(0)
    expectSafeCourseSummaries(res.body.data, ['course-a'])
  })

  it('uses an explicit student DTO when parent or relation metadata grows', async () => {
    Object.assign(questionnaire, { managementOnlyState: 'synthetic-private-state' })
    Object.assign(questionnaire.courseQuestionnaires[0], { managementOnlyLinkState: 'synthetic-private-link' })
    Object.assign(questionnaire.questionnaireScales[0], { managementOnlyScaleLinkState: 'synthetic-private-scale-link' })
    const res = await detail()
    expect(res.body.code).toBe(0)
    expect(res.body.data).not.toHaveProperty('managementOnlyState')
    expect(res.body.data.courseQuestionnaires[0]).not.toHaveProperty('managementOnlyLinkState')
    expect(res.body.data.questionnaireScales[0]).not.toHaveProperty('managementOnlyScaleLinkState')
  })

  it('denies course-only detail to an unrelated student before reading runner content', async () => {
    const res = await detail('unaffiliated-student')
    expect(res.statusCode).toBe(403)
    expect(mocks.sections).not.toHaveBeenCalled()
    expect(mocks.formSections).not.toHaveBeenCalled()
    expect(mocks.units).not.toHaveBeenCalled()
  })

  it.each(['PENDING', 'REMOVED'])('denies course-only detail when the student’s only relevant membership is %s', async status => {
    memberships = [{ studentId: 'student', courseId: 'course-a', status }]
    const res = await detail()
    expect(res.statusCode).toBe(403)
    expect(mocks.sections).not.toHaveBeenCalled()
  })

  it.each([{ visibility: 'HIDDEN' }, { status: 'DRAFT' }])('retains existing student restrictions for %j', async change => {
    questionnaire = makeQuestionnaire(change)
    const res = await detail()
    expect(res.statusCode).toBe(403)
    expect(mocks.sections).not.toHaveBeenCalled()
  })

  it('returns not found for an unknown questionnaire', async () => {
    const res = await detail('student', 'STUDENT', 'missing')
    expect(res.statusCode).toBe(404)
    expect(mocks.sections).not.toHaveBeenCalled()
  })
})

describe('questionnaire management compatibility', () => {
  it.each([['owner', 'TEACHER'], ['entry-admin', 'ADMIN']])('preserves the %s management response', async (userId, role) => {
    const res = await detail(userId, role)
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toEqual({ ...questionnaire,
      deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, formSections: sections, units,
    })
    expect(mocks.membership).not.toHaveBeenCalled()
    expect(mocks.questionnaire.mock.calls[0][0].include.courseQuestionnaires.include.course.select.courseCode).toBe(true)
  })

  it('denies another teacher before reading runner content', async () => {
    const res = await detail('another-teacher', 'TEACHER')
    expect(res.statusCode).toBe(403)
    expect(mocks.sections).not.toHaveBeenCalled()
  })
})
