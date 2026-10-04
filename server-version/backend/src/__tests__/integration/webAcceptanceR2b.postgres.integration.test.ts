import { randomUUID, createHash } from 'node:crypto'
import type { Server } from 'node:http'
import express from 'express'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { generateToken, generateClassroomResumeToken } from '../../utils/jwt'
import { csrfProtection } from '../../middleware/csrf'
import documentRoutes from '../../routes/documents'
import assignmentRoutes from '../../routes/assignments'
import checkinRoutes from '../../routes/checkins'
import assetRoutes from '../../routes/assets'
import classroomRoutes from '../../routes/classrooms'
import { cacheService } from '../../services/cacheService'
import { discardUnreferencedAsset } from '../../services/assetStorage'
import { ClassroomSocketHandler } from '../../services/classroomSocketHandler'
import { socketService } from '../../services/socketService'
import { StatsAggregator } from '../../services/statsAggregator'
import { joinClassroomStudent, startClassroomQuestion, submitClassroomAnswer, leaveClassroomStudent } from '../../services/classroomLifecycleService'

const DB = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
let server: Server, origin: string, teacher: any, other: any, student: any, stranger: any, course: any
let document: any, assignment: any, checkin: any, classroom: any, question: any, round: any
const users: string[] = [], assets: string[] = []
const pdf = Buffer.from('%PDF-1.4\n% 合成中文验收\n%%EOF')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const handler = new ClassroomSocketHandler()
async function user(role: any) {
  const row = await prisma.user.create({ data: { username: 'web-r2b-' + randomUUID(), passwordHash: 'isolated-test', role, teacherApproved: true } })
  users.push(row.id); return row
}
function headers(actor: any) {
  return { Cookie: 'ptool_session=' + generateToken({ userId: actor.id, username: actor.username, role: actor.role, tokenVersion: actor.tokenVersion }) + '; ptool_csrf=web-fixture-csrf',
    'x-csrf-token': 'web-fixture-csrf' }
}
async function request(actor: any, path: string, method = 'GET', data?: any) {
  const form = data instanceof FormData
  const response = await fetch(origin + '/api' + path, { method, headers: { ...headers(actor), ...(!form ? { 'Content-Type': 'application/json' } : {}) },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data) })
  return { status: response.status, body: await response.json() as any }
}
async function usage() {
  const result = await request(teacher, '/documents/' + document.id)
  expect(result.body.code).toBe(0); return result.body.data.usageCount
}
async function join(actor: any, data: any = {}) {
  const socket = { data: actor ? { authenticated: true, userId: actor.id, userRole: actor.role } : { authenticated: false }, emit: vi.fn(), join: vi.fn(), handshake: { address: '127.0.0.1' } }
  await (handler as any).handleStudentJoin(socket, { code: classroom.code, ...data })
  return socket
}
function snapshot(socket: any) { return socket.emit.mock.calls.find(([event]: any) => event === 'broadcast:question')?.[1] }

;(DB ? describe : describe.skip)('Web acceptance fixes through HTTP/PostgreSQL and the real classroom handler', () => {
  beforeAll(async () => {
    const selected = new URL(DB!), actual = new URL(process.env.DATABASE_URL ?? '')
    if (!['127.0.0.1','localhost'].includes(selected.hostname) || !/test|ci/i.test(selected.pathname) ||
        selected.host !== actual.host || selected.pathname !== actual.pathname) throw new Error('isolated loopback test DB required')
    if (process.env.REDIS_URL) {
      if (!['127.0.0.1','localhost'].includes(new URL(process.env.REDIS_URL).hostname)) throw new Error('isolated Redis required')
      await cacheService.initialize()
    }
    teacher = await user('TEACHER'); other = await user('TEACHER'); student = await user('STUDENT'); stranger = await user('STUDENT')
    course = await prisma.course.create({ data: { title: 'Web QA fixture', courseCode: randomUUID(), creatorId: teacher.id, status: 'PUBLISHED' } })
    await prisma.courseStudent.create({ data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' } })
    const app = express(); app.use(express.json()); app.use('/api', csrfProtection)
    app.use('/api/documents', documentRoutes); app.use('/api/assignments', assignmentRoutes); app.use('/api/checkins', checkinRoutes)
    app.use('/api/assets', assetRoutes); app.use('/api/classrooms', classroomRoutes)
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
    origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port
    vi.spyOn(socketService, 'broadcastToRoom').mockImplementation(() => {})
    vi.spyOn(socketService, 'getRoomConnectionCount').mockResolvedValue(0)
  }, 30000)
  afterAll(async () => {
    vi.restoreAllMocks()
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    if (classroom) await prisma.classroom.delete({ where: { id: classroom.id } })
    if (course) {
      const ids = [assignment?.id, checkin?.id].filter(Boolean)
      await prisma.assetReference.deleteMany({ where: { entityId: { in: ids } } })
      await prisma.course.delete({ where: { id: course.id } })
    }
    if (document) await prisma.document.delete({ where: { id: document.id } })
    for (const id of assets) {
      await prisma.assetReference.deleteMany({ where: { assetId: id } })
      await discardUnreferencedAsset(await prisma.storedAsset.findUniqueOrThrow({ where: { id } }))
    }
    if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
    await cacheService.close(); await prisma.$disconnect()
  })
  it('persists the exact Chinese filename and serves byte-identical PDF content', async () => {
    const form = new FormData(); form.append('title', '自定义合成标题')
    form.append('document', new Blob([pdf], { type: 'application/pdf' }), '中文原始验收资料.pdf')
    const result = await request(teacher, '/documents/upload', 'POST', form)
    expect(result.status).toBe(200); expect(result.body.code).toBe(0)
    document = result.body.data; assets.push(document.assetId)
    expect(document.fileName).toBe('中文原始验收资料.pdf')
    expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: document.assetId } })).originalName).toBe(document.fileName)
    const detail = await request(teacher, '/documents/' + document.id); expect(detail.body.data.fileName).toBe(document.fileName)
    const url = new URL(detail.body.data.url, origin)
    const downloaded = await fetch(origin + url.pathname + url.search, { headers: headers(teacher) })
    expect(downloaded.status).toBe(200); expect(sha(Buffer.from(await downloaded.arrayBuffer()))).toBe(sha(pdf))
    expect((await request(other, '/documents/' + document.id)).status).toBe(403)
    expect((await request(student, '/documents')).status).toBe(403)
  })
  it('counts distinct assignment/checkin references, updates removals and excludes library ownership', async () => {
    expect(await usage()).toBe(0)
    const attachment = { id: document.id, assetId: document.assetId, title: document.title, fileName: document.fileName }
    const created = await request(teacher, '/assignments', 'POST', { courseId: course.id, title: '题目作业', questions: [{ id: 'q-text', type: 'text', question: '合成主观题' }], documents: [attachment, attachment] })
    expect(created.body.code).toBe(0); assignment = created.body.data
    expect(await usage()).toBe(1)
    const checked = await request(teacher, '/checkins', 'POST', { courseId: course.id, title: '合成打卡', documents: [attachment] })
    expect(checked.body.code).toBe(0); checkin = checked.body.data
    expect(await usage()).toBe(2)
    const renamed = await request(teacher, '/documents/' + document.id, 'PUT', { title: '更新后的合成标题' })
    expect(renamed.body.code).toBe(0); expect(renamed.body.data.usageCount).toBe(2)
    expect((await request(teacher, '/assignments/' + assignment.id, 'PUT', { documents: [] })).body.code).toBe(0)
    expect(await usage()).toBe(1)
    expect((await request(teacher, '/checkins/' + checkin.id, 'PUT', { documents: [] })).body.code).toBe(0)
    expect(await usage()).toBe(0)
    const listed = await request(teacher, '/documents')
    expect(listed.body.data.list.find((row: any) => row.id === document.id).usageCount).toBe(0)
  })
  it('accepts question-only answers and retains the complete readback and teacher comment', async () => {
    const submitted = await request(student, '/assignments/' + assignment.id + '/submit', 'POST', { content: '', answers: { '0': '完整主观答案' }, expectedRevision: 0 })
    expect(submitted.body.code).toBe(0)
    const own = await request(student, '/assignments/' + assignment.id + '/my-submission')
    expect(own.body.data.answers).toEqual({ '0': '完整主观答案' })
    expect(own.body.data.content || '').toBe('')
    expect((await request(stranger, '/assignments/' + assignment.id)).status).toBe(403)
    await prisma.submission.update({ where: { id: own.body.data.id }, data: { comment: '合成批复', status: 'GRADED' } })
    expect((await request(student, '/assignments/' + assignment.id + '/my-submission')).body.data.comment).toBe('合成批复')
  })
  it('restores only the current authenticated student answer and keeps duplicate writes idempotent', async () => {
    classroom = await prisma.classroom.create({ data: { code: String(Math.floor(100000 + Math.random() * 900000)), name: '合成课堂', courseId: course.id, creatorId: teacher.id } })
    question = await prisma.classroomQuestion.create({ data: { classroomId: classroom.id, questionIndex: 1, questionContent: { type: 'single_choice', question: '颜色？', options: [{ value: 'B', label: '绿色' }] }, timeLimit: 600 } })
    round = await startClassroomQuestion(classroom, question.id, 600)
    expect(round.kind).toBe('started')
    const session = await joinClassroomStudent({ classroomId: classroom.id, studentId: student.id, isTemporary: false })
    const payload = { classroomId: classroom.id, questionId: question.id, sessionId: session.id, studentId: student.id, answer: 'B', expectedStartedAt: round.question.startedAt }
    await submitClassroomAnswer(payload)
    expect((await submitClassroomAnswer(payload)).alreadySubmitted).toBe(true)
    await expect(submitClassroomAnswer({ ...payload, answer: 'A' })).rejects.toThrow('您已提交过不同答案')
    expect(await prisma.classroomAnswer.count({ where: { questionId: question.id, sessionId: session.id } })).toBe(1)
    const rejoined = await join(student, { studentId: stranger.id, sessionId: 'forged' })
    expect(snapshot(rejoined).mySubmission.answer).toBe('B')
    expect(snapshot(await join(stranger, { studentId: student.id, sessionId: session.id })).mySubmission).toBeNull()
    expect(JSON.stringify(vi.mocked(socketService.broadcastToRoom).mock.calls)).not.toContain('mySubmission')
  })
  it('restores an anonymous answer only with its valid classroom-bound resume token', async () => {
    const session = await joinClassroomStudent({ classroomId: classroom.id, studentId: 'temp_' + randomUUID(), isTemporary: true })
    await submitClassroomAnswer({ classroomId: classroom.id, questionId: question.id, sessionId: session.id, studentId: session.studentId, answer: 'B', expectedStartedAt: round.question.startedAt })
    const restored = await join(null, { resumeToken: generateClassroomResumeToken(classroom.id, session.id) })
    expect(snapshot(restored).mySubmission.answer).toBe('B')
    expect(snapshot(await join(null, { resumeToken: 'invalid' }))).toBeUndefined()
    expect(snapshot(await join(null, { sessionId: session.id })).mySubmission).toBeNull()
  })
  it('retains historical answers while the live rate uses current students on every stats path', async () => {
    await prisma.classroomSession.updateMany({ where: { classroomId: classroom.id }, data: { leftAt: new Date() } })
    const active = await joinClassroomStudent({ classroomId: classroom.id, studentId: stranger.id, isTemporary: false })
    // Two departed answers and one unanswered active student must not produce 200%.
    const http = await request(teacher, '/classrooms/' + classroom.id + '/questions/' + question.id + '/stats')
    expect(http.body.code).toBe(0)
    expect(http.body.data.stats).toMatchObject({ answerCount: 2, totalSessions: 1, activeAnswerCount: 0, submissionRate: 0 })
    expect(await handler.readQuestionStats(classroom.id, question.id)).toMatchObject({ answerCount: 2, totalSessions: 1, activeAnswerCount: 0, submissionRate: 0 })
    expect(await new StatsAggregator().getQuestionStats(question.id)).toMatchObject({ totalAnswers: 2, totalSessions: 1, activeAnswerCount: 0, submissionRate: 0 })
    await leaveClassroomStudent({ classroomId: classroom.id, sessionId: active.id, studentId: stranger.id })
    expect(await handler.readQuestionStats(classroom.id, question.id)).toMatchObject({ answerCount: 2, totalSessions: 0, submissionRate: 0 })
  })
})
