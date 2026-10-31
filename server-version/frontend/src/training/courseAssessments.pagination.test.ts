import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get, cognitive } = vi.hoisted(() => ({ get: vi.fn(), cognitive: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { getMyAssignments: cognitive } }))
import { loadCourseAssessments } from './courseAssessments'

const courseId = 'synthetic-course'
const candidate = (id: string, course: string | null = null) => ({
  id, name: id, description: null, productKind: 'QUESTIONNAIRE',
  course: course ? { id: course, title: course } : null,
  attempt: null, latestCompletedAttempt: null,
  canContinue: false, canStartNewAttempt: true, availability: 'OPEN',
})
type Task = { id: string; kind: string; courses: { id: string }[] }
const match = (id: string, kind = 'COMPOSITE', course = courseId): Task => ({ id, kind, courses: [{ id: course }] })
const rows = (page: number, matches: Task[] = [], count = 100) => [
  ...matches, ...Array.from({ length: count - matches.length }, (_, index) => match(`filler-${page}-${index}`, 'ASSIGNMENT')),
]
const pageResult = (page: number, matches: Task[], total: number, count = 100) => ({ code: 0, data: { total, list: rows(page, matches, count) } })
function fixture(available: ReturnType<typeof candidate>[], page: (page: number) => unknown) {
  const requested: number[] = []
  get.mockImplementation(async (path: string) => {
    if (path === '/composite-assessments/available') return { code: 0, data: { list: available } }
    if (path.startsWith('/courses/my/tasks?')) {
      const query = new URL('https://synthetic.invalid' + path).searchParams
      expect(query.get('courseId')).toBe(courseId)
      expect(query.get('pageSize')).toBe('100')
      const number = Number(query.get('page'))
      requested.push(number)
      return page(number)
    }
    return { code: 0, data: { list: [] } }
  })
  return requested
}
const keys = (result: Awaited<ReturnType<typeof loadCourseAssessments>>) => result.items.map(item => item.key)
beforeEach(() => {
  get.mockReset()
  cognitive.mockReset().mockResolvedValue({ code: 0, data: [] })
})

describe('delivery pagination', () => {
  it('stops after all candidates are verified on the first page and keeps direct course rows', async () => {
    const requested = fixture([candidate('direct', courseId), candidate('a')], page => pageResult(page, page === 1 ? [match('a')] : [], 201, page === 3 ? 1 : 100))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:direct', 'composite:a'])
    expect(requested).toEqual([1])
  })

  it('keeps reading until cross-page matches are valid and rejects wrong-kind or wrong-course lookalikes', async () => {
    const requested = fixture([candidate('a'), candidate('b')], page => pageResult(page,
      page === 1 ? [match('a'), match('b', 'ASSIGNMENT'), match('b', 'COMPOSITE', 'another-course')] : page === 2 ? [match('b')] : [],
      301, page === 4 ? 1 : 100))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:a', 'composite:b'])
    expect(requested).toEqual([1, 2])
  })

  it('does not declare completion while another available id still needs delivery verification', async () => {
    const requested = fixture([candidate('a'), candidate('old-primary', 'another-course')], page => pageResult(page,
      page === 1 ? [match('a')] : page === 2 ? [match('old-primary')] : [], 301, page === 4 ? 1 : 100))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    // Preserve the existing later projection rule for non-null foreign course.
    expect(keys(result)).toEqual(['composite:a'])
    expect(requested).toEqual([1, 2])
  })

  it('reads the remaining pages when an available candidate never gets a valid delivery match', async () => {
    const requested = fixture([candidate('a'), candidate('missing')], page => pageResult(page, page === 1 ? [match('a')] : [], 201, page === 3 ? 1 : 100))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:a'])
    expect(requested).toEqual([1, 2, 3])
  })

  it('preserves a delivery failure before every candidate is verified', async () => {
    const requested = fixture([candidate('a'), candidate('missing')], page => page === 1
      ? pageResult(page, [match('a')], 201) : { code: 1, message: '临时投放失败' })
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual(['组合测评读取失败：临时投放失败'])
    expect(keys(result)).toEqual([])
    expect(requested).toEqual([1, 2])
  })

  it('preserves the incomplete-list failure for an empty required page', async () => {
    const requested = fixture([candidate('a'), candidate('missing')], page => page === 1
      ? pageResult(page, [match('a')], 201) : { code: 0, data: { total: 201, list: [] } })
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual(['组合测评读取失败：课程任务列表不完整'])
    expect(keys(result)).toEqual([])
    expect(requested).toEqual([1, 2])
  })

  it('keeps the original fifty-page bound when a required match is still absent', async () => {
    const requested = fixture([candidate('missing')], page => pageResult(page, [], 5001))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual(['组合测评读取失败：课程任务数量超出本次查询限制，请联系培训师'])
    expect(keys(result)).toEqual([])
    expect(requested).toHaveLength(50)
    expect(requested[49]).toBe(50)
  })

  it('honors the latest total when the task feed shrinks before an unmatched candidate is found', async () => {
    const requested = fixture([candidate('a'), candidate('missing')], page => page === 1
      ? pageResult(page, [match('a')], 301) : pageResult(page, [], 150, 50))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:a'])
    expect(requested).toEqual([1, 2])
  })

  it('accepts the final verified match on page fifty without reading page fifty-one', async () => {
    const requested = fixture([candidate('last')], page => pageResult(page, page === 50 ? [match('last')] : [], 5001))
    const result = await loadCourseAssessments(courseId, true)
    expect(result.errors).toEqual([])
    expect(keys(result)).toEqual(['composite:last'])
    expect(requested).toHaveLength(50)
    expect(requested[49]).toBe(50)
  })
})
