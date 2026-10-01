import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { UserRole } from '../../types'

const url = integrationDatabaseUrl('COGNITIVE_INTEGRATION_DB_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let userId: string
let teacherId: string
let courseId: string
const assignments: string[] = []
let createSession: typeof import('../../modules/cognitive/session.service')['createSession']
let getSession: typeof import('../../modules/cognitive/session.service')['getSession']
let readConfig: typeof import('../../modules/cognitive/session.service')['readCognitiveSessionConfig']
let submit: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinal']

suite('report reading on real final submission and persisted results', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    process.env.DATA_ENCRYPTION_KEY = '1'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = '2'.repeat(64)
    db = (await import('../../config/database')).prisma
    const service = await import('../../modules/cognitive/session.service')
    createSession = service.createSession; getSession = service.getSession; readConfig = service.readCognitiveSessionConfig
    submit = (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal
    const user = await db.user.create({ data: { username: `report-reading-${randomUUID()}`, passwordHash: 'integration-unused', role: 'STUDENT' } })
    userId = user.id
    teacherId = (await db.user.create({ data: { username: `report-teacher-${randomUUID()}`, passwordHash: 'integration-unused', role: 'TEACHER' } })).id
    const course = await db.course.create({ data: { title: 'Report reading integration', courseCode: `RR-${randomUUID()}`, creatorId: teacherId } })
    courseId = course.id
    await db.courseStudent.create({ data: { courseId, studentId: userId, status: 'ACTIVE' } })
  })
  afterAll(async () => {
    if (!db) return
    const sessions = await db.cognitiveSession.findMany({ where: { assignmentId: { in: assignments } }, select: { id: true } })
    const sessionIds = sessions.map(s => s.id)
    await db.cognitiveTrial.deleteMany({ where: { sessionId: { in: sessionIds } } })
    await db.cognitiveSession.deleteMany({ where: { id: { in: sessionIds } } })
    await db.cognitiveAssignment.deleteMany({ where: { id: { in: assignments } } })
    if (courseId) { await db.courseStudent.deleteMany({ where: { courseId } }); await db.course.delete({ where: { id: courseId } }) }
    if (userId) await db.user.delete({ where: { id: userId } })
    if (teacherId) await db.user.delete({ where: { id: teacherId } })
    await db.$disconnect()
  })
  it.each([18, 5])('freezes the %i/20 response report, replays it and enforces ownership', async valid => {
    const config = await db.cognitiveTestConfig.findFirstOrThrow({ where: { testType: 'reaction', configVersion: '1.1.0' } })
    const entry = requireCognitiveRegistryEntry('reaction', '1.0.0', '1.1.0')
    const frozen = freezeAssignmentProfile({ entry, baseConfig: config.config, profile: 'standard' })
    const { resolvedConfig: _resolvedConfig, ...frozenColumns } = frozen
    const assignment = await db.cognitiveAssignment.create({ data: { courseId, configId: config.id, createdBy: teacherId, title: 'Report reading fixture', status: 'PUBLISHED', publishedAt: new Date(), ...frozenColumns } })
    assignments.push(assignment.id)
    const runner = await createSession(userId, assignment.id)
    const session = await db.cognitiveSession.findUniqueOrThrow({ where: { id: runner.sessionId } })
    const snapshot = readConfig(session.configSnapshotEncrypted).snapshot!
    const trials = Array.from({ length: 20 }, (_, index) => createTrialEnvelope({ trialIndex: index, phase: 'test', payload: { foreperiodMs: 800, rtMs: index < valid ? 300 + index : null, prematureCount: 0, interrupted: false, inputMode: 'pointer' }, startedAtPerfMs: index * 3000, endedAtPerfMs: index * 3000 + 1100 }))
    const input = { sessionId: session.id, submissionId: `reading-${randomUUID()}`, attemptEpoch: 1, definitionHash: snapshot.configHash, contextSnapshotHash: null, trials }
    const result = await submit(userId, input)
    const report = result.response.report as { schemaVersion: number; reading: { interpretation: { state: string }; visuals: unknown[] }; headline: Array<{ key: string }> }
    expect(report.schemaVersion).toBe(2)
    expect(report.reading.interpretation.state).toBe(valid === 18 ? 'available' : 'withheld')
    expect(report.headline.some(m => m.key === 'medianRtMs')).toBe(valid === 18)
    const replay = await submit(userId, input)
    expect(replay.replayed).toBe(true)
    expect(replay.response.report).toEqual(report)
    const persisted = await db.cognitiveSession.findUniqueOrThrow({ where: { id: session.id } })
    expect(decryptCognitivePayload<{ report: unknown }>(persisted.resultSnapshotEncrypted!).report).toEqual(report)
    const history = await getSession(userId, session.id)
    expect(history.result!.report).toEqual(report)
    await expect(getSession('someone-else', session.id)).rejects.toMatchObject({ statusCode: 403 })
    const { listProfessionalReports } = await import('../../modules/cognitive/professional-report.service')
    const staff = await listProfessionalReports({ userId: teacherId, role: UserRole.TEACHER, assignmentId: assignment.id, offset: 0 })
    expect(staff.records[0].report).toEqual(report)
    expect(staff.records[0].reportId).toMatch(/^CR-[A-F0-9]{24}$/)
    expect(staff.records[0].finishedAt).toBe(decryptCognitivePayload<{ completedAt: string }>(persisted.resultSnapshotEncrypted!).completedAt)
    expect(JSON.stringify(staff)).not.toContain(userId)
    expect(JSON.stringify(staff)).not.toContain(session.id)
    const { auditPublishedCognitiveReports } = await import('../../modules/cognitive/report-rollout-audit')
    const coverage = await auditPublishedCognitiveReports(db, 'disposable-local-postgres')
    expect(coverage.assignments.find(row => row.assignmentId === assignment.id)?.state).toBe('current_two_audiences')
    expect((await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).resolvedReportSnapshotEncrypted).toBe(assignment.resolvedReportSnapshotEncrypted)
    await expect(listProfessionalReports({ userId: userId, role: UserRole.TEACHER, assignmentId: assignment.id, offset: 0 })).rejects.toMatchObject({ statusCode: 403 })
    await expect(listProfessionalReports({ userId, role: UserRole.STUDENT, assignmentId: assignment.id, offset: 0 })).rejects.toMatchObject({ statusCode: 403 })
  })
})
