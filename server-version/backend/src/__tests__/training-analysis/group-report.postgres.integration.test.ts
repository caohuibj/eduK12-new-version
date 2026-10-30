import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl, requireIsolatedReleaseDatabase} from '../integration/integration-env'
import * as builder from '../../modules/questionnaire-product/service'
import {startUserAttempt, getAttemptState} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {trainingAnalysisController} from '../../controllers/trainingAnalysisController'
import {authenticate, requireTeacher} from '../../middleware/auth'
import * as security from '../../modules/assessment-runtime/security'
import {generateToken} from '../../utils/jwt'

const selected = integrationDatabaseUrl('TRAINING_GROUP_REPORT_DATABASE_URL')
const suite = selected ? describe : describe.skip
let suffix = randomUUID().slice(0,8)
let server: Server | undefined, base = '', task: any, teacher: any, stranger: any, course: any, student: any, artifactId = ''
const calls: Array<{method: string; path: string; status: number}> = []
async function call(path = '', method = 'GET', body?: unknown, who = teacher) {
  const token = who ? generateToken({userId: who.id, username: who.username, role: who.role, accountDomain: 'TRAINING', tokenVersion: who.tokenVersion}) : ''
  const result = await fetch(base + path, {method, headers: {'Content-Type': 'application/json', ...(token ? {Cookie: `ptool_session=${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})})
  calls.push({method,path,status:result.status})
  return {status: result.status, body: await result.json() as {data: any; message: string}}
}

suite('Training real frozen Form to generated snapshot through HTTP and PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(selected!)
    const user = (name: string, role: 'TEACHER' | 'STUDENT') => prisma.user.create({data: {username: `${name}-${suffix}`, passwordHash: 'synthetic-only', role, accountDomain: 'TRAINING', teacherApproved: role === 'TEACHER'}})
    const resume = process.env.TRAINING_GROUP_REPORT_RESUME_TASK_ID
    if (resume) {
      task = await prisma.compositeAssessment.findUniqueOrThrow({where: {id: resume}, include: {questionnaireCourses: true}})
      teacher = await prisma.user.findUniqueOrThrow({where: {id: task.createdBy}})
      suffix = teacher.username.replace('group-training-owner-', '')
      stranger = await prisma.user.findUniqueOrThrow({where: {username: `group-training-outsider-${suffix}`}})
      course = await prisma.course.findUniqueOrThrow({where: {id: task.questionnaireCourses[0].courseId}})
      expect(task.status).toBe('PUBLISHED')
    } else {
      teacher = await user('group-training-owner', 'TEACHER'); stranger = await user('group-training-outsider', 'TEACHER')
      course = await prisma.course.create({data: {title: `合成群体课程 ${suffix}`, courseCode: `GROUP-${suffix}`, creatorId: teacher.id, courseType: 'TRAINING_COURSE', status: 'PUBLISHED'}})
      const actor = {userId: teacher.id, role: 'TEACHER' as const}
      task = await builder.create(actor, {requestId: randomUUID(), name: `合成群体任务 ${suffix}`, questionnaireType: 'COURSE', courseIds: [course.id], publicEnabled: false})
      task = await builder.addItem(actor, task.id, {revision: task.revision, item: {type: 'FORM', formType: 'number', formLabel: '本周小时', required: false,
        formDefinition: {type: 'NUMBER', prompt: '本周小时', required: false, options: [], rows: [], min: -10, max: 20}}})
      task = await builder.addItem(actor, task.id, {revision: task.revision, item: {type: 'FORM', formType: 'multiple_choice', formLabel: '学习活动', required: false, formOptions: [{value: 'a', label: '阅读'}, {value: 'b', label: '讨论'}]}})
      task = await builder.publish(actor, task.id, {revision: task.revision})
    }
    for (let i = 0; i < 6; i++) {
      let participant = await prisma.user.findUnique({where: {username: `group-training-student-${i}-${suffix}`}})
      if (!participant) {
        participant = await user(`group-training-student-${i}`, 'STUDENT')
        await prisma.courseStudent.create({data: {courseId: course.id, studentId: participant.id, status: 'APPROVED'}})
      }
      student ??= participant
      const retained = await prisma.compositeAssessmentAttempt.findFirst({where: {compositeAssessmentId: task.id, userId: participant.id}})
      if (retained?.status === 'COMPLETED') continue
      const attemptId = retained?.id ?? (await startUserAttempt(participant.id, task.id)).attempt.id
      let state = await getAttemptState(attemptId, {userId: participant.id}) as any
      while (state.status !== 'COMPLETED') {
        const section = state.currentItem
        expect(section.type).toBe('FORM_SECTION')
        await submitCompositeFormSectionFinal({attemptId, sectionId: section.id, userId: participant.id, submissionId: randomUUID(), attemptEpoch: state.attemptEpoch, definitionHash: section.definitionHash, contextSnapshotHash: state.contextSnapshotHash,
          answers: section.answers.map((answer: any) => ({formItemId: answer.formItemId ?? answer.id, value: (answer.formType ?? answer.type) === 'number' ? i - 2 : ['a','b']}))})
        state = await getAttemptState(attemptId, {userId: participant.id})
      }
    }
    const app = express(); app.use(express.json())
    app.get('/:id/training-group-reports', authenticate, requireTeacher, trainingAnalysisController.groupIndex)
    app.get('/:id/training-group-reports/sources/:taskId', authenticate, requireTeacher, trainingAnalysisController.groupTools)
    app.post('/:id/training-group-reports', authenticate, requireTeacher, trainingAnalysisController.groupGenerate)
    app.get('/:id/training-group-reports/:taskId/:artifactId', authenticate, requireTeacher, trainingAnalysisController.groupRead)
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}/${course.id}/training-group-reports`
  }, 60000)
  afterAll(async () => {
    if (server) {server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve()))}
    const {writeFile} = await import('node:fs/promises'); await writeFile('/tmp/training-group-http.json', JSON.stringify({synthetic: true, productionAccessed: false, calls}, null, 2))
    await (await import('../../config/queue')).closeQueues(true); await prisma.$disconnect()
  })
  it('generates once, reads a stored version, preserves old versions and limits source ownership', async () => {
    const index = await call(); expect(index.status).toBe(200); expect(index.body.data.tasks.some((row: any) => row.id === task.id)).toBe(true)
    const tools = await call(`/sources/${task.id}`); expect(tools.status, tools.body.message).toBe(200)
    const tool = tools.body.data.tools.find((row: any) => row.definitions.some((definition: any) => definition.type === 'NUMBER')); expect(tool.kind).toBe('FORM'); expect(tools.body.data.tools).toHaveLength(2)
    const {publication, configDigest, variantKey} = tool.source
    const selection = {taskId: task.id, toolKey: tool.key, publication, configDigest, variantKey}
    const first = await call('', 'POST', selection); expect(first.status, first.body.message).toBe(200)
    artifactId = first.body.data.artifactId
    const projection = first.body.data.projection
    expect(projection.completedN).toBe(6); expect(projection.countUnit).toBe('PERSON')
    expect(projection.metrics.find((row: any) => row.type === 'NUMBER')).toMatchObject({validN: 6, mean: .5, range: {min: -10, max: 20}})
    const choice = tools.body.data.tools.find((row: any) => row.definitions.some((definition: any) => definition.type === 'MULTIPLE'))
    const choiceReport = await call('', 'POST', {...selection, toolKey: choice.key}); expect(choiceReport.status, choiceReport.body.message).toBe(200)
    expect(choiceReport.body.data.projection.metrics[0].frequencies.map((row: any) => row.proportion)).toEqual([1,1])
    const decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    const reader = await call(`/${task.id}/${artifactId}`); expect(reader.status, reader.body.message).toBe(200); expect(reader.body.data).toEqual(first.body.data); expect(decrypt).toHaveBeenCalledTimes(1); decrypt.mockRestore()
    const updated = await call('', 'POST', selection); expect(updated.status, updated.body.message).toBe(200); expect(updated.body.data.artifactId).not.toBe(artifactId)
    expect((await call(`/${task.id}/${artifactId}`)).body.data).toEqual(first.body.data)
    expect((await call(`/${task.id}/${artifactId}`, 'GET', undefined, stranger)).status).toBe(404)
    expect((await call(`/${task.id}/${artifactId}`, 'GET', undefined, null)).status).toBe(401)
    const forbidden = await call('', 'POST', selection, student); expect(forbidden.status).toBe(403)
  }, 30000)
})
