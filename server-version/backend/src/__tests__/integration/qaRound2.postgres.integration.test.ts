import { randomUUID } from 'node:crypto'
import express from 'express'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { authenticate, requireTeacher } from '../../middleware/auth'
import { generateToken } from '../../utils/jwt'
import { courseQuestionnaires } from '../../controllers/courseQuestionnairesController'
import { organizationAdminController } from '../../modules/organization/organization.admin.controller'
import { requireOrganizationGovernance } from '../../modules/organization/access'
import { createOrganization, createMembership } from '../../modules/organization/service'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
let server: any, origin: string, owner: any, other: any, child: any, course: any, org: string, member: string
const old = randomUUID(), modern = randomUUID()
async function user(role: any, nickname: string) { return prisma.user.create({ data: { username: 'round2-' + randomUUID(), nickname, role, teacherApproved: true, passwordHash: 'isolated-test' } }) }
async function read(actor: any, path: string) {
  const token = generateToken({ userId: actor.id, username: actor.username, role: actor.role, tokenVersion: actor.tokenVersion })
  const r = await fetch(origin + path, { headers: { Cookie: 'ptool_session=' + token } })
  return { status: r.status, body: await r.json() as any }
}
;(url ? describe : describe.skip)('round two PostgreSQL and HTTP', () => {
  beforeAll(async () => {
    const selected = new URL(url!), actual = new URL(process.env.DATABASE_URL ?? '')
    if (!['127.0.0.1', 'localhost'].includes(selected.hostname) || !(/test|ci/i.test(selected.pathname) || (process.env.CI === 'true' && selected.pathname === '/ptool')) || selected.host !== actual.host || selected.pathname !== actual.pathname) throw new Error('isolated test database required')
    owner = await user('TEACHER', '合成教师'); other = await user('TEACHER', '其他教师'); child = await user('STUDENT', '合成学生')
    course = await prisma.course.create({ data: { title: 'QA course', courseCode: randomUUID(), creatorId: owner.id } })
    const another = await prisma.course.create({ data: { title: 'Other course', courseCode: randomUUID(), creatorId: owner.id } })
    await prisma.questionnaire.create({ data: { id: old, code: randomUUID(), name: 'Old', status: 'PUBLISHED', creatorId: owner.id, courseQuestionnaires: { create: { courseId: course.id } } } })
    for (const [id, status, kind, cid] of [[modern, 'PUBLISHED', 'QUESTIONNAIRE', course.id], [randomUUID(), 'DRAFT', 'QUESTIONNAIRE', course.id], [randomUUID(), 'PUBLISHED', 'QUESTIONNAIRE', another.id], [randomUUID(), 'PUBLISHED', 'LEGACY_COMPOSITE', course.id]]) {
      await prisma.compositeAssessment.create({ data: { id, name: 'QA collection', code: randomUUID(), createdBy: owner.id, status: status as any, productKind: kind, questionnaireType: kind === 'QUESTIONNAIRE' ? 'COURSE' : null, ...(kind === 'QUESTIONNAIRE' ? { questionnaireCourses: { create: { courseId: cid } } } : { courseId: cid }) } })
    }
    const o = await createOrganization({ name: 'Audit test school', meta: { actorUserId: owner.id, commandKey: randomUUID() } }); org = o.organization.id
    const m = await createMembership({ organizationId: org, userId: child.id, orgRole: 'MEMBER', persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: randomUUID() } }); member = m.id
    const app = express()
    app.get('/courses/:id/questionnaires', authenticate, requireTeacher, courseQuestionnaires)
    app.get('/organizations/:organizationId/audit', authenticate, requireOrganizationGovernance, organizationAdminController.listAudit)
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r)); origin = 'http://127.0.0.1:' + server.address().port
  }, 30000)
  afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect() })
  it('returns only published deliveries from both questionnaire families for this course', async () => {
    const r = await read(owner, '/courses/' + course.id + '/questionnaires')
    expect(r.status).toBe(200); expect(r.body.data.total).toBe(2)
    expect(r.body.data.list.map((q: any) => q.id).sort()).toEqual([old, modern].sort())
    expect(r.body.data.list.find((q: any) => q.id === modern).manageHref).toBe('/questionnaire-products/' + modern)
  })
  it('rejects students and unrelated teachers through HTTP middleware', async () => {
    for (const actor of [child, other]) expect((await read(actor, '/courses/' + course.id + '/questionnaires')).status).toBe(403)
  })
  it('joins audit actor and membership target names without opening audit access to outsiders', async () => {
    const path = '/organizations/' + org + '/audit', r = await read(owner, path)
    expect(r.status).toBe(200)
    expect(r.body.data.list.find((e: any) => e.targetId === member)).toMatchObject({ actorUserId: owner.id, actorDisplayName: '合成教师', targetDisplayName: '合成学生' })
    expect((await read(other, path)).status).toBe(403)
  })
})
