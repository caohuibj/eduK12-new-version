import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { cacheService } from '../../services/cacheService'
import { hashPassword } from '../../utils/password'
import { csrfProtection } from '../../middleware/csrf'
import { schoolOriginGuard } from '../../modules/campus/originGuard'
import authRoutes from '../../modules/campus/auth.routes'
import activityRoutes from '../../modules/campus/activity.routes'
import runRoutes from '../../modules/campus/activity.run.routes'
import compositeRoutes from '../../modules/campus/composite.routes'
import { educationSchoolScaleReportRouter } from '../../modules/reporting/education-scale-report.routes'
import teacherAuthRoutes from '../../modules/huiteacher/auth.routes'
import expertRoutes from '../../modules/huiteacher/expertRegistration.routes'
import observerRoutes from '../../modules/huiteacher/observer.routes'
import fieldFormRoutes from '../../modules/huiteacher/fieldForm.routes'
import { huiteacherOriginGuard } from '../../modules/huiteacher/originGuard'
import { issueHuiteacherExternalExpertInvite } from '../../modules/huiteacher/expertRegistration.service'
import { createHuiteacherTarget, createHuiteacherEvent, transitionHuiteacherEvent } from '../../modules/huiteacher/evaluation.service'
import { createHuiteacherForm, updateHuiteacherForm, publishHuiteacherForm } from '../../modules/huiteacher/forms.service'
import { bindHuiteacherFieldForm } from '../../modules/huiteacher/fieldForm.service'
import { readFormalHuiteacherObservations, revokeHuiteacherObserver } from '../../modules/huiteacher/observer.service'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

// Actual password login, product cookies, CSRF, route guards and PostgreSQL.
// Only account provisioning and content/publication setup use synthetic fixtures.
// No fake JWT, auth mock, fabricated FINAL or student-report entitlement.
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
let server: Server, base: string
function client() {
  const cookies = new Map<string, string>()
  let csrf = ''
  return async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + path, { method, headers: {
      Origin: base, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) })
    for (const raw of response.headers.getSetCookie()) {
      const first = raw.split(';')[0], split = first.indexOf('=')
      cookies.set(first.slice(0, split), first.slice(split + 1))
    }
    const text = await response.text()
    const json = text ? JSON.parse(text) as any : null
    if (path.endsWith('/csrf') && json.data?.csrfToken) csrf = json.data.csrfToken
    return { status: response.status, body: json }
  }
}
;(url ? describe : describe.skip)('School observer real login and HTTP scale journey', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    await cacheService.initialize()
    const app = express(); app.use(express.json()); app.use('/api', csrfProtection)
    app.use('/api/campus', schoolOriginGuard)
    app.use('/api/campus/auth', authRoutes)
    app.use('/api/huiteacher', huiteacherOriginGuard)
    app.use('/api/huiteacher/auth', teacherAuthRoutes)
    app.use('/api/huiteacher', expertRoutes, observerRoutes, fieldFormRoutes)
    app.use('/api/campus', activityRoutes, runRoutes, compositeRoutes, educationSchoolScaleReportRouter)
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode ?? 500).json({ code: err.code ?? 'ERROR', message: err.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    await cacheService.close(); await prisma.$disconnect()
  })
  it.each(['PARENT_REPORT', 'TEACHER_REPORT'] as const)('%s lists, starts, reads, completes and reopens with independent report privacy', async responseMode => {
    const f = await setupEducationLibraryRuntimeFixture({ db: prisma, product: 'SCHOOL', responseMode })
    const username = 'observer_' + randomUUID().replaceAll('-', '').slice(0, 20)
    const password = 'SyntheticPassword123'
    await prisma.user.update({ where: { id: f.participantUserId }, data: { passwordHash: await hashPassword(password) } })
    await prisma.campusAccount.create({ data: { userId: f.participantUserId, loginName: username, normalizedLogin: username } })
    const request = client()
    expect((await request('/api/campus/auth/csrf')).status).toBe(200)
    const login = await request('/api/campus/auth/login', 'POST', { username, password })
    expect(login, 'real password login').toMatchObject({ status: 200, body: { code: 0, data: { user: { id: f.participantUserId } } } })
    const tasksPath = responseMode === 'PARENT_REPORT' ? '/api/campus/my/parent-run-tasks' : `/api/campus/my/teacher-run-tasks?organizationId=${f.organizationId}`
    const tasks = await request(tasksPath)
    expect(tasks, 'visible assigned task').toMatchObject({ status: 200, body: { code: 0 } })
    expect(JSON.stringify(tasks.body.data)).toContain(f.executionId)
    const prefix = `/api/campus/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${f.executionId}`
    const [assignment] = await prisma.$queryRaw<Array<{ consentId: string | null }>>`SELECT a.consent_id AS "consentId" FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${f.executionId}`
    if (assignment.consentId) expect(await request(prefix + '/consent/accept', 'POST', {})).toMatchObject({ status: 200, body: { code: 0 } })
    const start = await request(prefix + '/start', 'POST', {})
    expect(start, 'actual HTTP START').toMatchObject({ status: 200, body: { code: 0, data: { state: 'STARTED', runtimeBindingKind: 'COMPOSITE' } } })
    const id = start.body.data.runtimeBindingRef
    const readPath = `/api/campus/composite-attempts/${id}?view=current-unit`
    const read = await request(readPath)
    expect(read, 'first frozen response read').toMatchObject({ status: 200, body: { code: 0 } })
    const state = read.body.data
    const item = state.currentItem
    expect(item, 'public frozen current scale').toMatchObject({ type: 'SCALE', definitionHash: expect.any(String) })
    const payload = { submissionId: randomUUID(), attemptEpoch: state.attemptEpoch ?? 1, definitionHash: item.definitionHash,
      contextSnapshotHash: state.contextSnapshotHash ?? state.context?.snapshotHash ?? null, answers: f.answers }
    const finalPath = `/api/campus/composite-attempts/${id}/items/${item.id}/scale/submit?response=receipt`
    const final = await request(finalPath, 'POST', payload)
    expect(final, 'real FINAL: ' + JSON.stringify(final)).toMatchObject({ status: 200, body: { code: 0 } })
    expect(await request(finalPath, 'POST', payload), 'same sealed submission replay').toMatchObject({ status: 200, body: { code: 0 } })
    expect((await request(finalPath, 'POST', { ...payload, answers: [{ itemCode: 'Q1', responseValue: 'option_2' }] })).status).toBe(409)
    expect(await request(readPath), 'completed re-open').toMatchObject({ status: 200, body: { code: 0, data: { status: 'COMPLETED' } } })
    const parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id } })
    expect(parent).toMatchObject({ status: 'COMPLETED', subjectUserId: f.subjectUserId, respondentUserId: f.participantUserId })
    const child = await prisma.assessment.findFirstOrThrow({ where: { compositeAttemptId: id } })
    expect(child.status).toBe('COMPLETED')
    expect(await prisma.assessmentUnitSnapshot.count({ where: { sourceAttemptId: child.id, payloadKind: 'UNIT_RESULT', terminalState: 'COMPLETED' } })).toBe(1)
    expect((await request(`/api/campus/library-scale/executions/${f.executionId}/report`)).status).toBe(404)
    expect((await client()(readPath)).status).toBe(401)
  }, 60_000)
  it('external expert registers from a scoped invite, logs in and submits the frozen field form', async () => {
    const manager = await prisma.user.create({ data: { username: 'expert_manager_' + randomUUID(), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
    const school = await prisma.organization.create({ data: { id: randomUUID(), name: 'Synthetic expert HTTP', productDomain: 'SCHOOL', createdByUserId: manager.id } })
    const member = await prisma.organizationMembership.create({ data: { id: randomUUID(), organizationId: school.id, userId: manager.id, orgRole: 'ORG_ADMIN' } })
    await prisma.educationProductEntitlement.create({ data: { organizationId: school.id, product: 'HUITEACHER', grantedByUserId: manager.id } })
    await prisma.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: school.id, membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: manager.id } })
    const scope = { organizationId: school.id, actorUserId: manager.id }
    const target = await createHuiteacherTarget({ ...scope, kind: 'TEAM', name: 'Synthetic observation team' })
    const event = await createHuiteacherEvent({ ...scope, targetId: target.id, kind: 'CLASSROOM', title: 'Synthetic field event' })
    const draft = await createHuiteacherForm({ ...scope, title: 'Synthetic classroom evidence' })
    await updateHuiteacherForm({ ...scope, formId: draft.id, expectedRevision: draft.revision, title: 'Synthetic classroom evidence', definition: { schemaVersion: 2, pages: [{ pageKey: 'p1', title: '课堂观察', questions: [{ itemKey: 'q1', type: 'LIKERT', prompt: '课堂讨论证据', required: true, options: [{ optionKey: 'low', label: '不足' }, { optionKey: 'high', label: '充分' }], rows: [] }] }] } })
    const updated = await prisma.huiteacherFormInstrument.findUniqueOrThrow({ where: { id: draft.id } })
    await publishHuiteacherForm({ ...scope, formId: draft.id, expectedRevision: updated.revision })
    await bindHuiteacherFieldForm({ ...scope, eventId: event.id, formId: draft.id })
    const invite = await issueHuiteacherExternalExpertInvite({ ...scope, eventId: event.id })
    const request = client(), username = 'expert_' + randomUUID().replaceAll('-', '').slice(0, 20), password = 'SyntheticPassword123'
    expect((await request('/api/huiteacher/auth/csrf')).status).toBe(200)
    const registration = await request('/api/huiteacher/education/register-expert', 'POST', { inviteCode: invite.inviteCode, username, password })
    expect(registration, 'invitation registration: ' + JSON.stringify(registration)).toMatchObject({ status: 200, body: { code: 0, data: { schoolMemberCreated: false, role: 'EXPERT' } } })
    const expert = registration.body.data
    await transitionHuiteacherEvent({ ...scope, eventId: event.id, action: 'OPEN', expectedVersion: 1 })
    expect((await request('/api/huiteacher/education/register-expert', 'POST', { inviteCode: invite.inviteCode, username: username + 'x', password })).status).toBe(404)
    expect(await request('/api/huiteacher/auth/login', 'POST', { username, password })).toMatchObject({ status: 200, body: { code: 0, data: { user: { id: expert.userId }, product: 'HUITEACHER' } } })
    expect(await prisma.organizationMembership.count({ where: { userId: expert.userId } })).toBe(0)
    const invitations = await request('/api/huiteacher/my-field-invitations')
    expect(invitations).toMatchObject({ status: 200, body: { code: 0 } })
    expect(JSON.stringify(invitations.body.data)).toContain(expert.observerGrantId)
    const formPath = `/api/huiteacher/field-invitations/${expert.observerGrantId}/form`
    expect(await request(formPath)).toMatchObject({ status: 200, body: { code: 0, data: { formId: draft.id } } })
    const notes = `/api/huiteacher/organizations/${school.id}/evaluation-events/${event.id}/field-notes`
    const privateNote = await request(notes, 'POST', { kind: 'PRIVATE_REFLECTION', content: '仅专家本人可见的合成反思。' })
    expect(privateNote).toMatchObject({ status: 200, body: { code: 0 } })
    const note = await request(notes, 'POST', { kind: 'FORMAL_FEEDBACK', content: '基于课堂观察的合成反馈。' })
    expect(note).toMatchObject({ status: 200, body: { code: 0 } })
    const finalPath = `/api/huiteacher/field-notes/${note.body.data.id}/submit`
    const payload = { expectedRevision: note.body.data.revision, fieldFormId: draft.id, answers: { q1: 'high' } }
    expect(await request(finalPath, 'POST', payload)).toMatchObject({ status: 200, body: { code: 0 } })
    expect((await request(finalPath, 'POST', payload)).status).toBe(409)
    const evidence = await prisma.huiteacherFieldFormEvidence.findUniqueOrThrow({ where: { recordId: note.body.data.id } })
    expect(evidence.answersCipher).not.toContain('high')
    const formal = await readFormalHuiteacherObservations({ ...scope, eventId: event.id })
    expect(formal.list.map(row => row.id)).toContain(note.body.data.id)
    expect(formal.list.map(row => row.id)).not.toContain(privateNote.body.data.id)
    expect((await request(`/api/huiteacher/organizations/${school.id}/evaluation-events/${event.id}/formal-notes`)).status).toBe(403)
    expect((await client()(formPath)).status).toBe(401)
    await revokeHuiteacherObserver({ ...scope, eventId: event.id, observerUserId: expert.userId })
    expect((await request(formPath)).status).not.toBe(200)
  }, 60_000)

})
