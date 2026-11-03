import { prisma } from '../config/database'
import { listAvailableForStudent } from '../modules/composite/composite.service'

export const taskStates = ['PENDING', 'IN_PROGRESS', 'UPCOMING', 'EXPIRED', 'COMPLETED', 'SUBMITTED_NOT_SATISFIED', 'UNAVAILABLE'] as const
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
  hasSatisfiedAttempt?: boolean
  latestSubmissionSatisfied?: boolean
}

type CourseRef = { id: string; title: string }
const stateOrder: TaskState[] = ['IN_PROGRESS', 'PENDING', 'UPCOMING', 'EXPIRED', 'UNAVAILABLE', 'SUBMITTED_NOT_SATISFIED', 'COMPLETED']
const compareTasks = (left: StudentTask, right: StudentTask) =>
  stateOrder.indexOf(left.state) - stateOrder.indexOf(right.state)
  || (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999')
  || `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)
const isActionable = (item: StudentTask) => Boolean(item.href && (item.canContinue || item.canStart))

/**
 * Build the task rows for an already-authorized course set. `courses` must come
 * from this student's own ACTIVE/APPROVED non-library memberships; `scope` is a
 * subset of its keys. With `linkedOnly`, rows that would carry no course in
 * `courses` are not read at all (the PUBLIC-questionnaire branch is narrowed to
 * questionnaires linked to the scope), which is exactly what a caller that
 * drops course-less rows would keep.
 */
async function buildStudentTasks(userId: string, courses: Map<string, CourseRef>, scope: string[], now: Date, linkedOnly: boolean, courseId?: string) {
  if (linkedOnly && !scope.length) return []
  const [assignments, checkins, questionnaires, composites] = await Promise.all([
    scope.length ? prisma.assignment.findMany({
      where: { courseId: { in: scope }, status: 'PUBLISHED' },
      select: { id: true, title: true, courseId: true, deadline: true, submissions: { where: { studentId: userId }, select: { status: true } } },
    }) : [],
    scope.length ? prisma.checkin.findMany({
      where: { courseId: { in: scope } },
      select: { id: true, title: true, courseId: true, endTime: true, submissions: { where: { studentId: userId }, select: { id: true } } },
    }) : [],
    // PUBLIC course questionnaires are available even without a membership,
    // exactly as /questionnaires/available; deduplicate by questionnaire id.
    prisma.questionnaire.findMany({
      where: linkedOnly
        ? { status: 'PUBLISHED', type: 'COURSE', visibility: { in: ['PUBLIC', 'COURSE'] }, courseQuestionnaires: { some: { courseId: { in: scope } } } }
        : { status: 'PUBLISHED', type: 'COURSE', OR: [
          { visibility: 'PUBLIC' },
          { visibility: 'COURSE', courseQuestionnaires: { some: { courseId: { in: scope } } } },
        ] },
      select: { id: true, name: true, courseQuestionnaires: { where: { courseId: { in: scope } }, select: { courseId: true } },
        assessments: { where: { userId }, select: { id: true, status: true, completedAt: true } } },
    }),
    // Reuse the memberships read above instead of a second membership query.
    listAvailableForStudent(userId, now.getTime(), courseId, true, scope),
  ])
  const deliveries = composites.length ? await prisma.questionnaireCourseDelivery.findMany({
    where: { compositeId: { in: composites.map(item => item.id) }, courseId: { in: scope } },
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
      : item.hasSatisfiedAttempt ? 'COMPLETED' : item.latestCompletedAttempt ? 'SUBMITTED_NOT_SATISFIED' : item.availability === 'EXPIRED' ? 'EXPIRED'
        : item.availability === 'UPCOMING' ? 'UPCOMING' : item.canStartNewAttempt ? 'PENDING' : 'UNAVAILABLE'
    tasks.push({ id: item.id, kind: 'COMPOSITE', title: item.name, courses: linkedCourses, state,
      hasSatisfiedAttempt: item.hasSatisfiedAttempt,
      latestSubmissionSatisfied: item.latestCompletedAttempt?.taskSatisfied,
      deadline: item.expiresAt?.toISOString() ?? null, opensAt: item.opensAt?.toISOString() ?? null,
      canContinue, canStart: state === 'PENDING' && item.canStartNewAttempt,
      href: canContinue ? `/student/composite/attempts/${item.attempt.id}`
        : (state === 'COMPLETED' || state === 'SUBMITTED_NOT_SATISFIED') && item.latestCompletedAttempt ? `/student/composite/attempts/${item.latestCompletedAttempt.id}/report`
          : state === 'PENDING' ? `/student/composite/${item.id}` : null })
  }
  return linkedOnly ? tasks.filter(item => item.courses.length > 0) : tasks
}

/**
 * Batched reads, independent of course count. No answers, scores or peer data.
 *
 * Work is bounded by the student's visible task set, not by the course catalog:
 * course scope and the cognitive-module filter are SQL predicates. Ordering and
 * paging stay in memory over that visible set on purpose: the sort key `state`
 * is derived from this student's attempts/submissions, the clock and attempt
 * limits, and `counts` (per state + ACTIONABLE) is part of the contract, so
 * every visible row must be classified whichever page is asked for.
 */
export async function listStudentTasks(userId: string, options: { page: number; pageSize: number; state?: typeof taskFilters[number]; courseId?: string }, now = new Date()) {
  const memberships = await prisma.courseStudent.findMany({
    where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false } },
    select: { course: { select: { id: true, title: true } } },
  })
  const courses = new Map(memberships.map(row => [row.course.id, row.course]))
  const courseIds = [...courses.keys()]
  // The caller-selected course never creates an entitlement. Push the
  // membership intersection into simple SQL predicates where possible;
  // Composite eligibility uses the same scope in its original runtime service.
  const scopedCourseIds = options.courseId
    ? courseIds.filter(id => id === options.courseId)
    : courseIds
  const tasks = await buildStudentTasks(userId, courses, scopedCourseIds, now, false, options.courseId)
  // Optional course filter is applied to the already-authorized membership
  // projection. A caller cannot add a course merely by naming its ID.
  const scoped = options.courseId
    ? tasks.filter(item => item.courses.some(course => course.id === options.courseId))
    : tasks
  const counts = Object.fromEntries(taskStates.map(state => [state, scoped.filter(item => item.state === state).length])) as Record<TaskState, number>
  const filtered = scoped.filter(item => options.state === 'ACTIONABLE' ? isActionable(item) : !options.state || item.state === options.state).sort(compareTasks)
  return { list: filtered.slice((options.page - 1) * options.pageSize, options.page * options.pageSize), total: filtered.length,
    counts: { ...counts, ACTIONABLE: scoped.filter(isActionable).length }, page: options.page, pageSize: options.pageSize, generatedAt: now.toISOString() }
}

/**
 * Every task linked to at least one of `courses`, in listStudentTasks order and
 * unpaged, with `courses` narrowed to that set. `courses` must be the caller's
 * own authorized memberships (for example the Training inbox's Training-course
 * memberships); tasks outside them are never read.
 */
export async function listStudentTasksInCourses(userId: string, courses: CourseRef[], now = new Date()) {
  const map = new Map(courses.map(course => [course.id, course]))
  return (await buildStudentTasks(userId, map, [...map.keys()], now, true)).sort(compareTasks)
}
