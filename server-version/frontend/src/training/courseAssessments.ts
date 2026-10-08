import apiClient from '../api/client'
import { cognitiveApi } from '../modules/cognitive/api'
import type { CognitiveAssignmentSummary } from '../modules/cognitive/types'

/** Only participant-visible metadata is projected. Scoring, FINAL and report
 * access remain with the existing runner and the original backend policies. */
export interface CourseAssessmentView {
  key: string
  name: string
  kind: 'questionnaire' | 'scale' | 'cognitive' | 'composite'
  typeLabel: string
  description: string | null
  status: string
  href: string | null
  action: string
  reportHref?: string | null
}
type CourseRef = { id: string; title: string } | null
type Question = {
  id: string; name: string; description: string | null
  completed: boolean; inProgress?: boolean; assessmentId: string | null
}
type Scale = {
  id: string; name: string; description: string | null
  courses?: Array<{ id: string; title: string }>; course?: CourseRef
  completed: boolean; inProgress?: boolean; assessmentId: string | null; retakeAllowed?: boolean
}
type Composite = {
  id: string; name: string; description: string | null; productKind?: string
  course: CourseRef
  canContinue: boolean; canStartNewAttempt: boolean
  attempt: { id: string; status: string; progress: number } | null
  latestCompletedAttempt: { id: string; status: string; progress: number } | null
  availability: 'OPEN' | 'UPCOMING' | 'EXPIRED'
}
export type CourseAssessmentResult = { items: CourseAssessmentView[]; errors: string[] }

async function attempt<T>(label: string, task: () => Promise<T>, fallback: T): Promise<{ value: T; error: string | null }> {
  try { return { value: await task(), error: null } }
  catch (error) {
    const reason = error instanceof Error ? error.message : '请稍后重试'
    return { value: fallback, error: label + '读取失败：' + reason }
  }
}

async function availableComposites(courseId: string): Promise<Composite[]> {
  const response = await apiClient.get<{ list: Composite[] }>('/composite-assessments/available')
  if (response.code !== 0) throw new Error(response.message || '组合测评暂不可用')
  const available = response.data?.list ?? []
  const delivered = new Set<string>()
  // A newer QUESTIONNAIRE can be delivered to multiple courses with its
  // legacy "course" property null. The existing student task feed is the
  // authority for this cross-course presentation; never infer from visibility.
  if (available.some(item => item.productKind === 'QUESTIONNAIRE' && !item.course)) {
    let page = 1, read = 0, total = 1
    const pageSize = 100
    while (read < total && page <= 50) {
      const result = await apiClient.get<{
        list: Array<{ id: string; kind: string; courses: Array<{ id: string }> }>
        total: number
      }>('/courses/my/tasks?page=' + page + '&pageSize=' + pageSize)
      if (result.code !== 0) throw new Error(result.message || '课程测评投放查询失败')
      const rows = result.data?.list || []
      total = result.data?.total ?? 0
      if (!rows.length && read < total) throw new Error('课程任务列表不完整')
      for (const row of rows) {
        if (row.kind === 'COMPOSITE' && row.courses?.some(course => course.id === courseId)) delivered.add(row.id)
      }
      read += rows.length
      page += 1
    }
    if (read < total) throw new Error('课程任务数量超出本次查询限制，请联系培训师')
  }
  return available.filter(item => item.course?.id === courseId || delivered.has(item.id))
}

export function projectCourseAssessments(
  courseId: string,
  questions: readonly Question[],
  scales: readonly Scale[],
  cognitives: readonly CognitiveAssignmentSummary[],
  composites: readonly Composite[],
): CourseAssessmentView[] {
  const items: CourseAssessmentView[] = []
  const enc = encodeURIComponent

  for (const item of questions) {
    const done = item.completed && !item.inProgress
    const href = done
      ? (item.assessmentId ? '/student/questionnaires/result/' + enc(item.assessmentId) : null)
      : '/student/questionnaires/' + enc(item.id)
    items.push({
      key: 'questionnaire:' + item.id, kind: 'questionnaire', name: item.name,
      typeLabel: '课程问卷', description: item.description,
      status: item.inProgress ? '进行中' : item.completed ? '已完成' : '待完成',
      href, action: item.inProgress ? '继续填写' : done ? (href ? '查看反馈' : '已完成') : '开始填写',
    })
  }

  for (const item of scales) {
    // Current /scales/available returns courses[], not the old course field.
    // PUBLIC standalone scales must not become training course assignments.
    if (!item.courses?.some(course => course.id === courseId) && item.course?.id !== courseId) continue
    const done = item.completed && !item.inProgress
    const canRetake = done && Boolean(item.retakeAllowed)
    const href = done
      ? item.assessmentId ? '/student/scales/result/' + enc(item.assessmentId)
        : canRetake ? '/student/scales/' + enc(item.id) : null
      : '/student/scales/' + enc(item.id)
    items.push({
      key: 'scale:' + item.id, kind: 'scale', name: item.name, typeLabel: '课程测评',
      description: item.description,
      status: item.inProgress ? '进行中' : done ? '已完成' : '待完成',
      href,
      action: item.inProgress ? '继续测评' : done ? item.assessmentId ? '查看反馈' : canRetake ? '再次测评' : '已完成' : '开始测评',
    })
  }

  for (const item of cognitives) {
    if (item.courseId !== courseId || item.listedStandalone === false || item.status !== 'PUBLISHED') continue
    items.push({
      key: 'cognitive:' + item.id, kind: 'cognitive', name: item.title,
      typeLabel: '认知测评', description: item.instruction,
      status: item.continueHref ? '进行中' : '已发布',
      href: '/student/cognitive/assignments/' + enc(item.id),
      action: item.continueHref ? '继续测评' : '查看测评',
    })
  }

  for (const item of composites) {
    // Null-course multi-delivery rows must be validated by the task feed in
    // availableComposites(). Legacy course-bound rows are checked again here.
    if (item.course && item.course.id !== courseId) continue
    const inProgress = Boolean(item.canContinue && item.attempt?.id)
    const finished = item.latestCompletedAttempt || (item.attempt?.status === 'COMPLETED' ? item.attempt : null)
    const reportHref = finished ? '/student/composite/attempts/' + enc(finished.id) + '/report' : null
    const href = inProgress
      ? '/student/composite/attempts/' + enc(item.attempt!.id)
      : item.canStartNewAttempt
        ? '/student/composite/' + enc(item.id)
        : reportHref
    const status = inProgress ? '进行中'
      : item.availability === 'UPCOMING' ? '未开放'
        : item.availability === 'EXPIRED' ? '已截止'
          : finished ? '已完成'
            : item.canStartNewAttempt ? '待完成' : '当前不可开始'
    items.push({
      key: 'composite:' + item.id, kind: 'composite', name: item.name,
      typeLabel: '组合测评', description: item.description,
      status, href, reportHref: reportHref && reportHref !== href ? reportHref : null,
      action: inProgress ? '继续测评' : item.canStartNewAttempt ? '开始测评' : reportHref ? '查看反馈' : status,
    })
  }
  return items
}

export async function loadCourseAssessments(courseId: string, cognitiveEnabled: boolean): Promise<CourseAssessmentResult> {
  const encoded = encodeURIComponent(courseId)
  const questionTask = attempt('课程问卷', async () => {
    const response = await apiClient.get<{ list: Question[] }>('/questionnaires/available?courseId=' + encoded)
    if (response.code !== 0) throw new Error(response.message || '请重试')
    return response.data?.list ?? []
  }, [] as Question[])
  const scaleTask = attempt('课程量表', async () => {
    const response = await apiClient.get<{ list: Scale[] }>('/scales/available')
    if (response.code !== 0) throw new Error(response.message || '请重试')
    return response.data?.list ?? []
  }, [] as Scale[])
  const cognitiveTask = cognitiveEnabled ? attempt('认知测评', async () => {
    const response = await cognitiveApi.getMyAssignments()
    if (response.code !== 0) throw new Error(response.message || '请重试')
    return response.data ?? []
  }, [] as CognitiveAssignmentSummary[]) : Promise.resolve({ value: [] as CognitiveAssignmentSummary[], error: null as string | null })
  const compositeTask = attempt('组合测评', () => availableComposites(courseId), [] as Composite[])

  const [questions, scales, cognitives, composites] = await Promise.all([questionTask, scaleTask, cognitiveTask, compositeTask])
  return {
    items: projectCourseAssessments(courseId, questions.value, scales.value, cognitives.value, composites.value),
    errors: [questions.error, scales.error, cognitives.error, composites.error].filter((error): error is string => Boolean(error)),
  }
}
