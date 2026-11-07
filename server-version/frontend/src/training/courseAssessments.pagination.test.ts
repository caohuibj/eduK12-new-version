import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get, cognitive } = vi.hoisted(() => ({ get: vi.fn(), cognitive: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { getMyAssignments: cognitive } }))
import { loadCourseAssessments } from './courseAssessments'

// The catalog contract: /composite-assessments/available?courseId is the
// single authority (scoped to the student's active membership and the
// questionnaire_course_deliveries table — locked server-side by
// courseAssessmentsContract.postgres.integration.test.ts). The former
// /courses/my/tasks re-verification read that same table page by page
// (up to 50 requests) and was removed. These tests pin the new shape:
// the availability list is trusted and the task feed is never consulted.
const courseId = 'synthetic-course'
const candidate = (id: string, course: string | null = null) => ({
  id, name: id, description: null, productKind: 'QUESTIONNAIRE',
  course: course ? { id: course, title: course } : null,
  attempt: null, latestCompletedAttempt: null,
  canContinue: false, canStartNewAttempt: true, availability: 'OPEN',
})
function fixture(available: ReturnType<typeof candidate>[]) {
  get.mockImplementation(async (path: string) => {
    if (path === '/composite-assessments/available') return { code: 0, data: { list: available } }
    if (path.startsWith('/courses/my/tasks')) throw Error('no secondary catalog reads allowed: ' + path)
    return { code: 0, data: { list: [] } }
  })
}
const keys = (result: Awaited<ReturnType<typeof loadCourseAssessments>>) => result.items.map(item => item.key)
beforeEach(() => {
  get.mockReset()
  cognitive.mockReset().mockResolvedValue({ code: 0, data: [] })
})

describe('course catalog trusts the backend availability contract', () => {
  it('keeps multi-course QUESTIONNAIRE rows (null course) without any task-feed reads', async () => {
    fixture([candidate('direct', courseId), candidate('multi-a'), candidate('multi-b')])
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:direct', 'composite:multi-a', 'composite:multi-b'])
    expect(get.mock.calls.every(([path]) => !String(path).includes('/courses/my/tasks'))).toBe(true)
  })

  it('still drops a non-null foreign-course row in the projection', async () => {
    fixture([candidate('ours', courseId), candidate('foreign', 'another-course')])
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:ours'])
    expect(get.mock.calls.every(([path]) => !String(path).includes('/courses/my/tasks'))).toBe(true)
  })

  it('surfaces the availability error without falling back to the task feed', async () => {
    get.mockImplementation(async (path: string) => {
      if (path === '/composite-assessments/available') return { code: 1, message: '组合测评暂不可用' }
      if (path.startsWith('/courses/my/tasks')) throw Error('no secondary catalog reads allowed: ' + path)
    return { code: 0, data: { list: [] } }
    })
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual(['组合测评读取失败：组合测评暂不可用'])
    expect(result.items).toEqual([])
  })
})
