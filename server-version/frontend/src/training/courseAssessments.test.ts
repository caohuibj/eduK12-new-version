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
      { id: 'q-1', name: '课程反馈', description: null, completed: false, assessmentId: null, courses: [{ id: course, title: '研修' }] },
      { id: 'q-public', name: '全站公开但未布置', description: null, completed: false, assessmentId: null, courses: [] },
    ] } })
    if (url === '/scales/available') return Promise.resolve({ code: 0, data: { list: [
      { id: 'scale-a', name: '课程量表', description: null, courses: [{ id: course, title: '研修' }, { id: 'second', title: '另一相关课程' }], completed: false, assessmentId: null },
      { id: 'scale-b', name: '另一门课', description: null, courses: [{ id: 'another', title: '其他' }], completed: false, assessmentId: null },
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
  it('retains archived multi-course work and feedback using the authorized task feed', async () => {
    const fallback = get.getMockImplementation()!
    get.mockImplementation((url: string) => url === '/composite-assessments/available'
      ? Promise.resolve({ code: 0, data: { list: [{
        ...composite('delivered', null), canStartNewAttempt: false, canContinue: true,
        attempt: { id: 'existing', status: 'IN_PROGRESS', progress: 40 },
        latestCompletedAttempt: { id: 'completed', status: 'COMPLETED', progress: 100 },
      }] } }) : fallback(url))
    const row = (await loadCourseAssessments(course, true)).items.find(item => item.key === 'composite:delivered')
    expect(row).toMatchObject({ action: '继续测评', href: '/student/composite/attempts/existing', reportHref: '/student/composite/attempts/completed/report' })
    expect(get).toHaveBeenCalledWith('/courses/my/tasks?page=1&pageSize=100&courseId=' + course)
  })

  it('retains archived completed feedback without offering another attempt', () => {
    const [row] = projectCourseAssessments(course, [], [], [], [{
      ...composite('archived', course), canStartNewAttempt: false,
      attempt: { id: 'completed', status: 'COMPLETED', progress: 100 },
      latestCompletedAttempt: { id: 'completed', status: 'COMPLETED', progress: 100 },
    }])
    expect(row).toMatchObject({ href: '/student/composite/attempts/completed/report', action: '查看反馈' })
  })

  it('uses enrolled course scopes, retaining independent source ids without name-only merging', async () => {
    const result = await loadCourseAssessments(course, true)
    expect(result.errors).toEqual([])
    expect(result.items.map(item => item.key)).toEqual([
      'questionnaire:q-1', 'scale:scale-a', 'cognitive:cog-1',
      'composite:legacy', 'composite:delivered',
    ])
    expect(result.items.some(item => item.name === '外部任务' || item.name === '另一门课')).toBe(false)
    expect(result.items.some(item => item.name === '全站公开但未布置')).toBe(false)
    expect(result.items.find(item => item.key === 'composite:delivered')?.href).toBe('/student/composite/delivered')
    expect(myCognitive).toHaveBeenCalledWith(course)
    expect(get).toHaveBeenCalledWith('/scales/available', { params: { courseId: course } })
    expect(myCognitive).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/composite-assessments/available', { params: { courseId: course } })
    expect(get).toHaveBeenCalledWith('/courses/my/tasks?page=1&pageSize=100&courseId=' + encodeURIComponent(course))
  })

  it('distinguishes exhausted cognitive quotas without offering an implicit fresh start', () => {
    const cognitive = {
      id: 'cog-quota', courseId: course, title: '可查看的任务',
      instruction: null, listedStandalone: true, status: 'PUBLISHED' as const,
      remainingAttempts: 0, continueHref: null,
    }
    const result = projectCourseAssessments(course, [], [], [cognitive as any], [])
    expect(result[0].status).toBe('尝试次数已用尽')
    expect(result[0].action).toBe('查看任务')
    expect(result[0].href).toBe('/student/cognitive/assignments/cog-quota')
  })

  it('fetches historical records but hides unstarted cognitive tasks when disabled', async () => {
    const result = await loadCourseAssessments(course, false)
    expect(result.errors).toEqual([])
    expect(result.items.some(item => item.kind === 'cognitive')).toBe(false)
    expect(myCognitive).toHaveBeenCalledTimes(1)
  })

  it('OFF links stored current/history sessions directly without offering new starts', async () => {
    myCognitive.mockResolvedValue({ code:0, data:[
      { id:'active', courseId:course, title:'已准入', status:'PUBLISHED', continueHref:'/student/cognitive/sessions/accepted' },
      { id:'done', courseId:course, title:'历史', status:'PUBLISHED', latestCompletedSessionId:'completed' },
      { id:'new', courseId:course, title:'未开始', status:'PUBLISHED' },
    ] })
    const rows=(await loadCourseAssessments(course,false)).items.filter(item=>item.kind==='cognitive')
    expect(rows.map(row=>row.href)).toEqual(['/student/cognitive/sessions/accepted','/student/cognitive/sessions/completed/result'])
    expect(rows.map(row=>row.action)).toEqual(['继续测评','查看反馈'])
  })

  it('retains an unadmitted shell as paused without a runner or start link', () => {
    const rows=projectCourseAssessments(course,[],[],[{ id:'shell',courseId:course,title:'等待恢复',status:'PUBLISHED',admissionPaused:true } as any],[{
      ...composite('shell-composite',course),canContinue:false,canStartNewAttempt:false,admissionPaused:true,
      attempt:{id:'shell-parent',status:'IN_PROGRESS',progress:0.5},
    }],false)
    expect(rows).toHaveLength(2)
    expect(rows.every(row=>row.href===null && row.status==='暂不可用，重新开放后继续')).toBe(true)
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

  it('does not present an expired composite attempt as resumable', () => {
    const result = projectCourseAssessments(course, [], [], [], [{
      ...composite('deadline-ended', course),
      availability: 'EXPIRED',
      canStartNewAttempt: false,
      canContinue: true,
      attempt: { id: 'unfinished', status: 'IN_PROGRESS', progress: 0.4 },
    }])
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('已截止')
    expect(result[0].href).toBeNull()
    expect(result[0].action).not.toBe('继续测评')
  })

  it('retains usable sources and reports partial outages explicitly', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/scales/available') throw new Error('source unavailable')
      if (url.includes('/questionnaires/available')) return Promise.resolve({ code: 0, data: { list: [
        { id: 'q', name: '仍可填写', description: null, completed: false, assessmentId: null, courses: [{ id: course, title: '研修' }] },
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

it.each([false, true])('preserves report and historical qualification in Training course cards: satisfied=%s', (hasSatisfiedAttempt) => {
  const [row] = projectCourseAssessments(course, [], [], [], [{ ...composite('q', course),
    canStartNewAttempt: false, hasSatisfiedAttempt,
    attempt: { id: 'new', status: 'COMPLETED', progress: 100 },
    latestCompletedAttempt: { id: 'new', status: 'COMPLETED', progress: 100, taskSatisfied: false },
  }])
  expect(row).toMatchObject({ completed: hasSatisfiedAttempt, status: hasSatisfiedAttempt ? '任务已达成' : '已交卷，任务未达成', href: '/student/composite/attempts/new/report', action: '查看反馈' })
  expect(row.taskSatisfactionLabel).toBe(hasSatisfiedAttempt ? '本次未达成，历史达成仍保留' : '本次作答已保存并计入次数，可查看报告。')
})

it('uses the authorized retry allowance and never presents a submitted attempt as resumable', () => {
  const [row] = projectCourseAssessments(course, [], [], [], [{ ...composite('q', course),
    hasSatisfiedAttempt: false, canStartNewAttempt: true,
    latestCompletedAttempt: { id: 'submitted', status: 'COMPLETED', progress: 100, taskSatisfied: false },
  }])
  expect(row).toMatchObject({ completed: false, status: '已交卷，任务未达成', href: '/student/composite/q', action: '再次测评', reportHref: '/student/composite/attempts/submitted/report' })
})

it('uses completion metadata independently from availability, exhausted attempts and active work', () => {
  const question = { id: 'q', name: '问卷', description: null, completed: true, inProgress: false, assessmentId: 'qa', courses: [{ id: course, title: '课' }] }
  const scale = { id: 's', name: '量表', description: null, completed: true, inProgress: false, assessmentId: 'sa', retakeAllowed: true, course: { id: course, title: '课' } }
  const rows = projectCourseAssessments(course, [question], [scale], [
    { id: 'exhausted', courseId: course, title: '次数用尽', status: 'PUBLISHED', remainingAttempts: 0 },
    { id: 'finished', courseId: course, title: '已完成认知', status: 'PUBLISHED', latestCompletedSessionId: 'result' },
    { id: 'active', courseId: course, title: '继续认知', status: 'PUBLISHED', latestCompletedSessionId: 'old', continueHref: '/student/cognitive/sessions/active' },
  ] as any, [])
  expect(rows.map(row => [row.key, row.completed])).toEqual([
    ['questionnaire:q', true], ['scale:s', true], ['cognitive:exhausted', false], ['cognitive:finished', true], ['cognitive:active', false],
  ])
  expect(rows.find(row => row.key === 'scale:s')?.href).toBe('/student/scales/result/sa')
})
