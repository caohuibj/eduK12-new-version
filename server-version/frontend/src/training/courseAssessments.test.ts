import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, myCognitive } = vi.hoisted(() => ({ get: vi.fn(), myCognitive: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { getMyAssignments: myCognitive } }))

import { loadCourseAssessments, projectCourseAssessments } from './courseAssessments'

const course = 'training-001'
const composite = (id: string, courseId: string | null) => ({
  id, name: id, description: null, productKind: 'QUESTIONNAIRE',
  course: courseId ? { id: courseId, title: courseId } : null,
  attempt: null, latestCompletedAttempt: null,
  canContinue: false, canStartNewAttempt: true, availability: 'OPEN' as const,
})

beforeEach(() => {
  get.mockReset()
  myCognitive.mockReset()
  myCognitive.mockResolvedValue({ code: 0, data: [
    { id: 'cog-1', courseId: course, title: '记忆任务', instruction: null, status: 'PUBLISHED', listedStandalone: true },
    { id: 'cog-other', courseId: 'another', title: '外部任务', instruction: null, status: 'PUBLISHED' },
    { id: 'cog-inner', courseId: course, title: '组合内部包装', instruction: null, status: 'PUBLISHED', listedStandalone: false },
  ] })
  get.mockImplementation((url: string) => {
    if (url.includes('/questionnaires/available')) return Promise.resolve({ code: 0, data: { list: [
      { id: 'q-1', name: '课程反馈', description: null, completed: false, assessmentId: null },
    ] } })
    if (url === '/scales/available') return Promise.resolve({ code: 0, data: { list: [
      { id: 'scale-a', name: '课程量表', description: null, course: { id: course, title: '研修' }, completed: false, assessmentId: null },
      { id: 'scale-b', name: '另一门课', description: null, course: { id: 'another', title: '其他' }, completed: false, assessmentId: null },
    ] } })
    if (url === '/composite-assessments/available') return Promise.resolve({ code: 0, data: { list: [
      composite('legacy', course), composite('external', 'another'), composite('delivered', null),
    ] } })
    if (url.includes('/courses/my/tasks')) return Promise.resolve({ code: 0, data: { total: 2, list: [
      { id: 'delivered', kind: 'COMPOSITE', courses: [{ id: course }] },
      { id: 'external', kind: 'COMPOSITE', courses: [{ id: 'another' }] },
    ] } })
    throw new Error('Unexpected request: ' + url)
  })
})

describe('course-scope measurement projection', () => {
  it('uses enrolled course scopes, retaining independent source ids without name-only merging', async () => {
    const result = await loadCourseAssessments(course, true)
    expect(result.errors).toEqual([])
    expect(result.items.map(item => item.key)).toEqual([
      'questionnaire:q-1', 'scale:scale-a', 'cognitive:cog-1',
      'composite:legacy', 'composite:delivered',
    ])
    expect(result.items.some(item => item.name === '外部任务' || item.name === '另一门课')).toBe(false)
    expect(result.items.find(item => item.key === 'composite:delivered')?.href).toBe('/student/composite/delivered')
    expect(myCognitive).toHaveBeenCalledTimes(1)
  })

  it('does not fetch a disabled cognitive capability', async () => {
    const result = await loadCourseAssessments(course, false)
    expect(result.errors).toEqual([])
    expect(result.items.some(item => item.kind === 'cognitive')).toBe(false)
    expect(myCognitive).not.toHaveBeenCalled()
  })

  it('does not turn a blocked assessment into an enabled start link', () => {
    const result = projectCourseAssessments(course, [], [], [], [
      { ...composite('locked', course), canStartNewAttempt: false, availability: 'UPCOMING' },
      composite('wrong-course', 'another'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].href).toBeNull()
    expect(result[0].status).toBe('未开放')
  })

  it('retains usable sources and reports partial outages explicitly', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/scales/available') throw new Error('source unavailable')
      if (url.includes('/questionnaires/available')) return Promise.resolve({ code: 0, data: { list: [
        { id: 'q', name: '仍可填写', description: null, completed: false, assessmentId: null },
      ] } })
      if (url === '/composite-assessments/available') return Promise.resolve({ code: 0, data: { list: [] } })
      throw new Error('Unexpected request ' + url)
    })
    const result = await loadCourseAssessments(course, true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/课程量表读取失败/)
    expect(result.items.some(item => item.name === '仍可填写')).toBe(true)
  })
})
