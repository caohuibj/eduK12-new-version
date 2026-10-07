import { prisma } from '../config/database'
import { listAvailableForStudent } from '../modules/composite/composite.service'

export const taskStates = ['PENDING', 'IN_PROGRESS', 'UPCOMING', 'EXPIRED', 'COMPLETED', 'UNAVAILABLE'] as const
export type TaskState = typeof taskStates[number]
export const taskFilters = ['ACTIONABLE', ...taskStates] as const
export interface StudentTask {
  id: string
  kind: 'ASSIGNMENT' | 'CHECKIN' | 'QUESTIONNAIRE' | 'COMPOSITE'
  title: string
  courses: { id: string; title: string }[]
  state: TaskState
  deadline: string | null
  opensAt: string | null
  canContinue: boolean
  canStart: boolean
  href: string | null
}

/** Batched reads, independent of course count. No answers, scores or peer data. */
export async function listStudentTasks(userId: string, options: { page: number; pageSize: number; state?: typeof taskFilters[number] }, now = new Date()) {
  const memberships = await prisma.courseStudent.findMany({
    where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false } },
    select: { course: { select: { id: true, title: true } } },
  })
  const courses = new Map(memberships.map(row => [row.course.id, row.course]))
  const courseIds = [...courses.keys()]
  const [assignments, checkins, questionnaires, composites] = await Promise.all([
    courseIds.length ? prisma.assignment.findMany({
      where: { courseId: { in: courseIds }, status: 'PUBLISHED' },
      select: { id: true, title: true, courseId: true, deadline: true, submissions: { where: { studentId: userId }, select: { status: true } } },
    }) : [],
    courseIds.length ? prisma.checkin.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true, title: true, courseId: true, endTime: true, submissions: { where: { studentId: userId }, select: { id: true } } },
    }) : [],
    // PUBLIC course questionnaires are available even without a membership,
    // exactly as /questionnaires/available; deduplicate by questionnaire id.
    prisma.questionnaire.findMany({
      where: { status: 'PUBLISHED', type: 'COURSE', OR: [
        { visibility: 'PUBLIC' },
        { visibility: 'COURSE', courseQuestionnaires: { some: { courseId: { in: courseIds } } } },
      ] },
      select: { id: true, name: true, courseQuestionnaires: { where: { courseId: { in: courseIds } }, select: { courseId: true } },
        assessments: { where: { userId }, select: { id: true, status: true, completedAt: true } } },
    }),
    listAvailableForStudent(userId, now.getTime()),
  ])
  const deliveries = composites.length ? await prisma.questionnaireCourseDelivery.findMany({
    where: { compositeId: { in: composites.map(item => item.id) }, courseId: { in: courseIds } },
    select: { compositeId: true, courseId: true },
  }) : []
  const deliveryCourses = new Map<string, string[]>()
  for (const row of deliveries) {
    const ids = deliveryCourses.get(row.compositeId) ?? []
    ids.push(row.courseId)
    deliveryCourses.set(row.compositeId, ids)
  }
  const courseList = (ids: string[]) => [...new Set(ids)].flatMap(id => courses.has(id) ? [courses.get(id)!] : [])
  const past = (deadline: Date | null) => Boolean(deadline && deadline.getTime() < now.getTime())
  const tasks: StudentTask[] = []
  for (const item of assignments) {
    const submission = item.submissions[0]
    const completed = Boolean(submission && submission.status !== 'DRAFT')
    const expired = past(item.deadline)
    const state: TaskState = completed ? 'COMPLETED' : expired ? 'EXPIRED' : submission ? 'IN_PROGRESS' : 'PENDING'
    tasks.push({ id: item.id, kind: 'ASSIGNMENT', title: item.title, courses: courseList([item.courseId]), state,
      deadline: item.deadline?.toISOString() ?? null, opensAt: null, canContinue: state === 'IN_PROGRESS', canStart: state === 'PENDING',
      href: expired && !completed ? null : `/student/assignments/${item.id}` })
  }
  for (const item of checkins) {
    const state: TaskState = item.submissions.length ? 'COMPLETED' : past(item.endTime) ? 'EXPIRED' : 'PENDING'
    tasks.push({ id: item.id, kind: 'CHECKIN', title: item.title, courses: courseList([item.courseId]), state,
      deadline: item.endTime?.toISOString() ?? null, opensAt: null, canContinue: false, canStart: state === 'PENDING',
      href: state === 'EXPIRED' ? null : `/student/checkins/${item.id}` })
  }
  for (const item of questionnaires) {
    const active = item.assessments.some(attempt => attempt.status === 'IN_PROGRESS')
    const completed = item.assessments.filter(attempt => attempt.status === 'COMPLETED')
      .sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0) || left.id.localeCompare(right.id))[0]
    const state: TaskState = active ? 'IN_PROGRESS' : completed ? 'COMPLETED' : 'PENDING'
    tasks.push({ id: item.id, kind: 'QUESTIONNAIRE', title: item.name, courses: courseList(item.courseQuestionnaires.map(row => row.courseId)), state,
      deadline: null, opensAt: null, canContinue: active, canStart: state === 'PENDING',
      href: state === 'COMPLETED' ? `/student/questionnaires/result/${completed.id}` : `/student/questionnaires/${item.id}` })
  }
  for (const item of composites) {
    const linkedCourses = courseList([...(item.course ? [item.course.id] : []), ...(deliveryCourses.get(item.id) ?? [])])
    if (!linkedCourses.length) continue
    const available = item.availability === 'OPEN'
    const canContinue = available && item.canContinue
    const state: TaskState = item.canContinue
      ? item.availability === 'EXPIRED' ? 'EXPIRED' : item.availability === 'UPCOMING' ? 'UPCOMING' : 'IN_PROGRESS'
      : item.latestCompletedAttempt ? 'COMPLETED' : item.availability === 'EXPIRED' ? 'EXPIRED'
        : item.availability === 'UPCOMING' ? 'UPCOMING' : item.canStartNewAttempt ? 'PENDING' : 'UNAVAILABLE'
    tasks.push({ id: item.id, kind: 'COMPOSITE', title: item.name, courses: linkedCourses, state,
      deadline: item.expiresAt?.toISOString() ?? null, opensAt: item.opensAt?.toISOString() ?? null,
      canContinue, canStart: state === 'PENDING' && item.canStartNewAttempt,
      href: canContinue ? `/student/composite/attempts/${item.attempt.id}`
        : state === 'COMPLETED' ? `/student/composite/attempts/${item.latestCompletedAttempt.id}/report`
          : state === 'PENDING' ? `/student/composite/${item.id}` : null })
  }
  const counts = Object.fromEntries(taskStates.map(state => [state, tasks.filter(item => item.state === state).length])) as Record<TaskState, number>
  const order: TaskState[] = ['IN_PROGRESS', 'PENDING', 'UPCOMING', 'EXPIRED', 'UNAVAILABLE', 'COMPLETED']
  const actionable = (item: StudentTask) => Boolean(item.href && (item.canContinue || item.canStart))
  const filtered = tasks.filter(item => options.state === 'ACTIONABLE' ? actionable(item) : !options.state || item.state === options.state).sort((left, right) =>
    order.indexOf(left.state) - order.indexOf(right.state)
    || (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999')
    || `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
  return { list: filtered.slice((options.page - 1) * options.pageSize, options.page * options.pageSize), total: filtered.length,
    counts: { ...counts, ACTIONABLE: tasks.filter(actionable).length }, page: options.page, pageSize: options.pageSize, generatedAt: now.toISOString() }
}
