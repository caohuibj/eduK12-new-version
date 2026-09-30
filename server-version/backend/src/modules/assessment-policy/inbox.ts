import { prisma } from '../../config/database'
import { listStudentAssignments } from '../cognitive/assignment.service'
import type { UserRole } from '@prisma/client'
import { listAssignedRunTasks } from '../assessment-run/productRead'
import { relationalProductService } from '../assessment-relational/product.service'
import { filterLegacyRelationalAssignments } from '../assessment-relational/legacy-domain'
import { listStudentTasks } from '../../services/studentTasks'

export interface RespondentAssessmentTask {
  taskId: string
  sourceType: 'COURSE' | 'ORGANIZATION_RUN' | 'RELATIONAL' | 'SELF_SERVICE'
  sourceId: string
  title: string
  state: string
  deadline: string | null
  resourceFamily: string
  resourceKey: string
  resourceVersion: string | null
  subject: { userId: string; role: string; displayName?: string } | null
  respondent: { userId: string; role: string }
  relationship: string | null
  perspective: string | null
  consentState: 'REQUIRED' | 'NOT_REQUIRED'
  launchTarget: string | null
  reportTarget: string | null
  resultAvailability: 'REPORT' | 'COMPLETION_ONLY' | 'PENDING'
  organization: { id: string } | null
  course: { id: string; title: string }[]
  runTask?: Awaited<ReturnType<typeof listAssignedRunTasks>>['list'][number]
}

/** Only the authenticated respondent is accepted. Owning services continue to
 * authorize start/resume/report; discovery never grants access or returns scores. */
export async function listRespondentAssessments(userId: string, accountRole: UserRole) {
  const [runs, relational, course] = await Promise.all([
    listAssignedRunTasks(userId),
    ['STUDENT', 'TEACHER', 'PARENT'].includes(accountRole)
      ? relationalProductService.tasks(userId, accountRole).then(filterLegacyRelationalAssignments)
      : Promise.resolve([]),
    accountRole === 'STUDENT' ? listStudentTasks(userId, { page: 1, pageSize: 200 }) : Promise.resolve(null),
  ])
  const list: RespondentAssessmentTask[] = runs.list.map(task => ({
    taskId: `run:${task.executionId}`, sourceType: 'ORGANIZATION_RUN', sourceId: task.runId,
    title: task.runName, state: task.status, deadline: task.deadline?.toISOString() ?? null,
    resourceFamily: task.resourceFamily, resourceKey: task.resourceKey, resourceVersion: task.resourceVersion,
    subject: { userId: task.subjectUserId, role: task.subjectRole, displayName: task.subjectName }, respondent: { userId, role: task.respondentRole }, relationship: task.relationship, perspective: task.perspective,
    consentState: task.consentRequired ? 'REQUIRED' : 'NOT_REQUIRED', launchTarget: null,
    reportTarget: task.reportAttemptId ? `/relational/attempts/${encodeURIComponent(task.reportAttemptId)}/report` : null,
    resultAvailability: task.reportAttemptId ? 'REPORT' : task.status === 'COMPLETED' ? 'COMPLETION_ONLY' : 'PENDING',
    organization: { id: task.organizationId }, course: [], runTask: task,
  }))
  for (const task of relational) list.push({
    taskId: `relational:${task.assignmentId}`, sourceType: 'RELATIONAL', sourceId: task.assignmentId,
    title: task.product?.title ?? '测评任务', state: task.status, deadline: null,
    resourceFamily: task.resourceKind, resourceKey: task.resourceKey, resourceVersion: task.resourceVersion,
    subject: { userId: task.subjectUserId, role: task.subjectRole }, respondent: { userId, role: task.respondentRole },
    relationship: task.relationshipKind, perspective: task.perspective,
    consentState: task.consentRequired ? 'REQUIRED' : 'NOT_REQUIRED',
    launchTarget: task.launchable ? '/relational/tasks' : null, reportTarget: null,
    resultAvailability: task.status === 'COMPLETED' ? 'COMPLETION_ONLY' : 'PENDING', organization: null, course: [],
  })
  for (const task of course?.list ?? []) {
    if (task.kind !== 'QUESTIONNAIRE' && task.kind !== 'COMPOSITE') continue
    list.push({
      taskId: `course:${task.kind}:${task.id}`, sourceType: 'COURSE', sourceId: task.id,
      title: task.title, state: task.state, deadline: task.deadline, resourceFamily: task.kind,
      resourceKey: task.id, resourceVersion: null, subject: { userId, role: 'STUDENT' },
      respondent: { userId, role: 'STUDENT' }, relationship: 'SELF', perspective: 'SELF_REPORT',
      consentState: 'NOT_REQUIRED', launchTarget: task.state !== 'COMPLETED' ? task.href : null,
      reportTarget: task.state === 'COMPLETED' ? task.href : null,
      resultAvailability: task.state === 'COMPLETED' && task.href ? 'REPORT' : 'PENDING',
      organization: null, course: task.courses,
    })
  }
  const ownScales = await prisma.assessment.findMany({ where: { userId, questionnaireAssessmentId: null, compositeAttemptId: null }, orderBy: { startedAt: 'desc' }, take: 101,
    select: { id: true, status: true, scaleId: true, scale: { select: { name: true, code: true, instrumentVersion: true } } } })
  for (const row of ownScales.slice(0, 100)) list.push({ taskId: 'scale:' + row.id, sourceType: 'SELF_SERVICE', sourceId: row.id,
    title: row.scale.name, state: row.status, deadline: null, resourceFamily: 'SCALE', resourceKey: row.scale.code, resourceVersion: row.scale.instrumentVersion,
    subject: { userId, role: accountRole }, respondent: { userId, role: accountRole }, relationship: 'SELF', perspective: 'SELF_REPORT', consentState: 'NOT_REQUIRED',
    launchTarget: row.status === 'IN_PROGRESS' ? '/student/scales/' + encodeURIComponent(row.scaleId) : null,
    reportTarget: row.status === 'COMPLETED' ? '/student/scales/result/' + encodeURIComponent(row.id) : null,
    resultAvailability: row.status === 'COMPLETED' ? 'REPORT' : 'PENDING', organization: null, course: [] })
  if (accountRole === 'STUDENT') {
    const situational = await prisma.situationalAttempt.findMany({ where: { userId, compositeAttemptId: null }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, instrumentKey: true, instrumentVersion: true, status: true } })
    for (const row of situational) list.push({ taskId: 'situational:' + row.id, sourceType: 'SELF_SERVICE', sourceId: row.id, title: '情境测评', state: row.status,
      deadline: null, resourceFamily: 'SITUATIONAL', resourceKey: row.instrumentKey, resourceVersion: row.instrumentVersion,
      subject: { userId, role: accountRole }, respondent: { userId, role: accountRole }, relationship: 'SELF', perspective: 'SELF_REPORT', consentState: 'NOT_REQUIRED',
      launchTarget: row.status === 'IN_PROGRESS' ? '/student/situational/' + encodeURIComponent(row.instrumentKey) : null,
      reportTarget: row.status === 'COMPLETED' ? '/student/situational/attempts/' + encodeURIComponent(row.id) + '/result' : null,
      resultAvailability: row.status === 'COMPLETED' ? 'REPORT' : 'PENDING', organization: null, course: [] })
    const assignments = await listStudentAssignments(userId)
    const sessions = await prisma.cognitiveSession.findMany({ where: { userId, assignmentId: { in: assignments.map(a => a.id) }, compositeAttemptId: null },
      orderBy: { startedAt: 'desc' }, select: { id: true, assignmentId: true, status: true } })
    for (const a of assignments) {
      const session = sessions.find(s => s.assignmentId === a.id)
      const state = session?.status === 'COMPLETED' ? 'COMPLETED' : a.dueAt && a.dueAt < new Date() ? 'EXPIRED' : a.opensAt && a.opensAt > new Date() ? 'UPCOMING' : session?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING'
      list.push({ taskId: 'cognitive:' + a.id, sourceType: 'COURSE', sourceId: a.id, title: a.title, state, deadline: a.dueAt?.toISOString() ?? null,
        resourceFamily: 'COGNITIVE', resourceKey: a.config.testType, resourceVersion: String(a.config.configVersion), subject: { userId, role: accountRole }, respondent: { userId, role: accountRole },
        relationship: 'SELF', perspective: 'SELF_REPORT', consentState: 'NOT_REQUIRED', launchTarget: ['PENDING', 'IN_PROGRESS'].includes(state) ? '/student/cognitive/assignments/' + encodeURIComponent(a.id) : null,
        reportTarget: state === 'COMPLETED' && session ? '/student/cognitive/sessions/' + encodeURIComponent(session.id) + '/result' : null,
        resultAvailability: state === 'COMPLETED' ? 'REPORT' : 'PENDING', organization: null, course: a.course ? [{ id: a.course.id, title: a.course.title }] : [] })
    }
  }
  list.sort((a, b) => Number(a.state === 'COMPLETED') - Number(b.state === 'COMPLETED') || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId))
  return { list, pendingCount: list.filter(task => ['OPEN', 'ASSIGNED', 'PENDING', 'STARTED', 'IN_PROGRESS'].includes(task.state)).length,
    truncated: ownScales.length > 100 || runs.truncated || relational.length >= 100 || (course?.total ?? 0) > 200 }
}
