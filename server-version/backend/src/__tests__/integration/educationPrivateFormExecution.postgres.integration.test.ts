import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupPrivateFormExecutionFixture, privateExecutionFormDefinition } from './educationPrivateFormExecutionFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { getAttemptState, startUserAttempt } from '../../modules/composite/composite.service'
import { submitCompositeFormSectionFinal, type SectionSubmitInput } from '../../modules/composite/final-submit.service'
import { loadFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { readFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { csrfProtection } from '../../middleware/csrf'
import { generateToken } from '../../utils/jwt'
import { HUITEACHER_AUTH_COOKIE_NAME, HUITEACHER_CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import teacherRouter from '../../modules/huiteacher/privateFormRuntime.routes'
import { closeTeacherRun } from '../../modules/huiteacher/run.service'
import { cancelAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { createSqlRelationalAssignmentRepository } from '../../modules/assessment-relational/repository'
import { createRelationalAssessmentService } from '../../modules/assessment-relational/service'
import { parentPortalService } from '../../modules/parent-portal/service'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient, server: Server, base: string
async function headers(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } }), csrf = 'synthetic-form-csrf'
  const token = generateToken({ userId, username: user.username, role: user.role, tokenVersion: user.tokenVersion,
    accountDomain: 'SCHOOL', sessionProduct: 'HUITEACHER', mfaVerifiedAt: Math.floor(Date.now() / 1000) })
  return { cookie: `${HUITEACHER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,
    [CSRF_HEADER_NAME]: csrf, 'content-type': 'application/json' }
}
async function currentInput(attemptId: string, userId: string, choice: 'a' | 'b' = 'a'): Promise<SectionSubmitInput> {
  const state = await getAttemptState(attemptId, { userId }), section = state.currentItem
  if (!section || section.type !== 'FORM_SECTION') throw new Error('Expected real current FORM_SECTION')
  const answers: SectionSubmitInput['answers'] = []
  for (const item of section.answers) {
    const key = item.formDefinition.itemKey
    if (key === 'explain' && choice === 'b') continue
    answers.push({ formItemId: item.formItemId, value: key === 'choice' ? choice : key === 'explain' ? { _surveyRefusal: true } : key === 'number' ? 7 : 'Synthetic comment' })
  }
  return { attemptId, userId, sectionId: section.formSectionId, submissionId: randomUUID(), attemptEpoch: state.attemptEpoch,
    definitionHash: section.definitionHash, contextSnapshotHash: state.contextSnapshotHash, answers }
}
async function started(executionId: string, actorUserId: string) {
  const result = await startAssessmentRunExecution({ executionId, actorUserId })
  if (result.state !== 'STARTED' || result.runtimeBindingKind !== 'COMPOSITE') throw new Error('Expected actual Form COMPOSITE START')
  return result.runtimeBindingRef
}
async function writes(attemptId: string) {
  return { units: await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attemptId }, orderBy: { slotKey: 'asc' } }),
    answers: await db.compositeFormAnswer.findMany({ where: { attemptId }, orderBy: { itemId: 'asc' } }),
    sections: await db.compositeFormSectionAttempt.findMany({ where: { attemptId }, orderBy: { sectionId: 'asc' } }) }
}
async function assertFinal(attemptId: string, executionId: string, state: 'REFUSED' | 'NOT_SHOWN') {
  const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
  expect(parent.status).toBe('COMPLETED')
  if (!parent.frozenActiveSlotSetEncrypted) throw new Error('Actual START must persist its slot set')
  const slots = await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted, db)
  expect(slots.snapshotHash).toBe(parent.frozenActiveSlotSetHash); expect(slots.slots).toHaveLength(2)
  const units = await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attemptId } })
  expect(units).toHaveLength(2)
  for (const unit of units) {
    expect(unit).toMatchObject({ unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', canonicalResultEncrypted: null })
    expect(slots.slots.find(slot => slot.slotKey === unit.slotKey)?.sourceDefinitionIdentity.hash).toBe(unit.sourceDefinitionHash)
  }
  const facts = units.map(unit => readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(unit.collectionFactsEncrypted!)))
  expect(facts.every(fact => fact.schemaVersion === 3)).toBe(true)
  expect(facts.flatMap(fact => fact.items)).toContainEqual(expect.objectContaining({ label: 'Explain', state, value: null }))
  expect(facts.flatMap(fact => fact.items)).toContainEqual(expect.objectContaining({ label: 'A number', value: 7 }))
  expect(await db.assessment.count({ where: { compositeAttemptId: attemptId } })).toBe(0)
  expect((await db.$queryRaw<Array<{ status: string; assignment: string }>>`
    SELECT e.status, a.status AS assignment FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${executionId}`)[0])
    .toMatchObject({ status: 'COMPLETED', assignment: 'COMPLETED' })
}
suite('Private Form real educational execution, typed FINAL and current task authority', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32); process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const app = express(); app.use(express.json()); app.use('/api', csrfProtection); app.use('/api/huiteacher', teacherRouter)
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.code ?? 'ERROR', message: error.message }))
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
    base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await db?.$disconnect() })
  it('keeps School fixed-version pages and refusal after a new author version and author capability revocation, with exactly-once FINAL', async () => {
    const f = await setupPrivateFormExecutionFixture(db, 'SCHOOL')
    const definition = privateExecutionFormDefinition(); definition.pages[0].questions[0].prompt = 'Newer prompt'
    const newerDraft = await tools.updatePrivateTool(f.context, f.source.draft.id, { expectedRevision: f.source.draft.revision, title: 'Newer title', definition })
    const newer = await tools.freezePrivateTool(f.context, f.source.draft.id, { expectedRevision: newerDraft.revision, expectedContentHash: newerDraft.contentHash })
    expect(newer.id).not.toBe(f.source.version.id)
    const membership = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationCapabilityGrant.updateMany({ where: { membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', revokedAt: null }, data: { revokedAt: new Date() } })
    await expect(startAssessmentRunExecution({ executionId: f.executionId, actorUserId: f.managerUserId })).rejects.toMatchObject({ code: 'RUN_EXECUTION_ACTOR' })
    const id = await started(f.executionId, f.participantUserId), state = await getAttemptState(id, { userId: f.participantUserId })
    expect(state.currentItem.answers[0].label).toBe('Choose')
    const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id } })
    const source = await db.compositeAssessment.findUniqueOrThrow({ where: { id: parent.compositeAssessmentId } })
    expect(source.creationKey).toContain(f.source.version.id); expect(source.creationKey).not.toContain(newer.id)
    expect(source.trainingContentSnapshot).toMatchObject({ units: [] })
    expect(source.trainingContentSnapshotHash).toBe(canonicalHash(source.trainingContentSnapshot))
    expect(canonicalHash((await db.educationPrivateToolVersion.findUniqueOrThrow({ where: { id: f.source.version.id } })).definition)).toBe(canonicalHash(privateExecutionFormDefinition()))
    await expect(startUserAttempt(f.participantUserId, parent.compositeAssessmentId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(getAttemptState(id, { userId: f.managerUserId })).rejects.toMatchObject({ statusCode: 403 })
    const first = await currentInput(id, f.participantUserId)
    await expect(submitCompositeFormSectionFinal({ ...first, submissionId: randomUUID(), answers: [] })).rejects.toMatchObject({ code: 'FORM_ANSWER_INVALID' })
    expect((await writes(id)).units).toHaveLength(0)
    expect(await submitCompositeFormSectionFinal(first)).toMatchObject({ replayed: false })
    const afterFirst = await writes(id)
    expect(await submitCompositeFormSectionFinal(first)).toMatchObject({ replayed: true }); expect(await writes(id)).toEqual(afterFirst)
    const second = await currentInput(id, f.participantUserId)
    await submitCompositeFormSectionFinal(second); await getAttemptState(id, { userId: f.participantUserId })
    await assertFinal(id, f.executionId, 'REFUSED')
  }, 120_000)
  it('uses real Teacher cookies, CSRF, task listing, exact parent reads and typed section FINAL over HTTP', async () => {
    const f = await setupPrivateFormExecutionFixture(db, 'TEACHER'), auth = await headers(f.participantUserId), manager = await headers(f.managerUserId)
    const listUrl = base + '/api/huiteacher/my-private-form-tasks'
    expect((await fetch(listUrl)).status).toBe(401)
    const listResponse = await fetch(listUrl, { headers: auth }); expect(listResponse.status).toBe(200)
    const listed = (await listResponse.json()).data
    expect(listed.list).toContainEqual(expect.objectContaining({ executionId: f.executionId }))
    const startUrl = `${base}/api/huiteacher/run-executions/${f.executionId}/start-private-form`
    expect((await fetch(startUrl, { method: 'POST', headers: { cookie: auth.cookie } })).status).toBe(403)
    const foreignStart = await fetch(startUrl, { method: 'POST', headers: manager })
    expect(foreignStart.status).toBe(200); expect((await foreignStart.json()).data).toEqual({ state: 'WITHHELD' })
    const startResponse = await fetch(startUrl, { method: 'POST', headers: auth }); expect(startResponse.status).toBe(200)
    const start = (await startResponse.json()).data; expect(start).toMatchObject({ state: 'STARTED', runtimeBindingKind: 'COMPOSITE' })
    const id = start.runtimeBindingRef, readUrl = `${base}/api/huiteacher/private-form-composite-attempts/${id}`
    // Synthetic clock condition only: all task, parent and actor identities are real.
    await db.$executeRaw`UPDATE assessment_runs SET intake_deadline=statement_timestamp()-interval '1 minute' WHERE id=${f.runId}`
    await closeTeacherRun({ organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId })
    expect((await fetch(readUrl, { headers: manager })).status).toBe(404)
    for (let page = 0; page < 2; page++) {
      const read = await fetch(readUrl, { headers: auth }); expect(read.status).toBe(200)
      const current = (await read.json()).data; expect(current.currentItem.type).toBe('FORM_SECTION')
      const input = await currentInput(id, f.participantUserId, 'b')
      expect(input.definitionHash).toBe(current.currentItem.definitionHash)
      const { attemptId: _attemptId, userId: _userId, sectionId, ...body } = input
      const submitUrl = `${readUrl}/form-sections/${sectionId}/submit`
      if (page === 0) {
        const hidden = current.currentItem.answers.find((item: any) => item.formDefinition.itemKey === 'explain')
        const injection = await fetch(submitUrl, { method: 'POST', headers: auth, body: JSON.stringify({ ...body, submissionId: randomUUID(),
          answers: [...body.answers, { formItemId: hidden.formItemId, value: 'Must not persist hidden content' }] }) })
        expect(injection.status).toBe(400); expect((await writes(id)).units).toHaveLength(0)
      }
      expect((await fetch(`${readUrl}/form-sections/${randomUUID()}/submit`, { method: 'POST', headers: auth, body: JSON.stringify(body) })).status).toBe(404)
      const response = await fetch(submitUrl, { method: 'POST', headers: auth, body: JSON.stringify(body) }); expect(response.status).toBe(200)
      const replay = await fetch(submitUrl, { method: 'POST', headers: auth, body: JSON.stringify(body) }); expect(replay.status).toBe(200)
      expect((await replay.json()).data.replayed).toBe(true)
    }
    await getAttemptState(id, { userId: f.participantUserId }); await assertFinal(id, f.executionId, 'NOT_SHOWN')
    const receipt = await fetch(readUrl, { headers: auth }); expect(receipt.status).toBe(200)
    expect((await receipt.json()).data.status).toBe('COMPLETED')
    const completedStart = await fetch(startUrl, { method: 'POST', headers: auth })
    expect(completedStart.status).toBe(200); expect((await completedStart.json()).data).toEqual({ state: 'WITHHELD' })
    expect(await db.compositeAssessmentAttempt.count({ where: { assignmentRef: (await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id } })).assignmentRef } })).toBe(1)
  }, 120_000)
  it.each(['PARENT_REPORT', 'TEACHER_REPORT'] as const)('runs School %s with actual consent and separate subject/respondent, without individual report grants', async responseMode => {
    const f = await setupPrivateFormExecutionFixture(db, 'SCHOOL', responseMode)
    expect(f.participantUserId).not.toBe(f.subjectUserId)
    expect(await acceptRunExecutionConsent({ executionId: f.executionId, actorUserId: f.participantUserId })).toMatchObject({ accepted: true })
    const id = await started(f.executionId, f.participantUserId)
    const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id } })
    expect(parent).toMatchObject({ userId: f.participantUserId, subjectUserId: f.subjectUserId, respondentUserId: f.participantUserId })
    for (let page = 0; page < 2; page++) await submitCompositeFormSectionFinal(await currentInput(id, f.participantUserId))
    await getAttemptState(id, { userId: f.participantUserId }); await assertFinal(id, f.executionId, 'REFUSED')
    const [track] = await db.$queryRaw<Array<{ policy: any }>>`SELECT frozen_resource_policy AS policy FROM assessment_run_tracks WHERE id=${f.track.id}`
    expect(Object.values(track.policy.resultDisclosure.audiences).every((value: any) => value.mode === 'NONE')).toBe(true)
    await expect(getAttemptState(id, { userId: f.subjectUserId })).rejects.toMatchObject({ statusCode: 403 })
    await expect(getAttemptState(id, { userId: f.managerUserId })).rejects.toMatchObject({ statusCode: 403 })
  }, 120_000)
  it('blocks FINAL under a current deny and preserves active tasks when Run cancellation is refused', async () => {
    const f = await setupPrivateFormExecutionFixture(db, 'SCHOOL', 'SELF', 2), executions = await f.executions()
    const ids = [await started(executions[0].id, f.participantUserId), await started(executions[1].id, f.participantUserId)]
    const inputs = [await currentInput(ids[0], f.participantUserId), await currentInput(ids[1], f.participantUserId)]
    const before = [await writes(ids[0]), await writes(ids[1])]
    await db.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      userId: f.participantUserId, permission: 'RUN_START', reason: 'Synthetic collection deny', deniedByUserId: f.managerUserId } })
    await expect(submitCompositeFormSectionFinal(inputs[0])).rejects.toMatchObject({ code: 'RUN_ACTOR_AUTHORITY_REVOKED' })
    expect(await writes(ids[0])).toEqual(before[0])
    const executionState = await f.executions()
    const parentState = await db.compositeAssessmentAttempt.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })
    // An active runtime cannot be cancelled through the existing Run API.
    // Current denies still stop new FINAL writes on both already-started tasks.
    await expect(cancelAssessmentRun({ organizationId: f.organizationId, runId: f.runId,
      schoolActivity: { actor: f.manager, courseId: f.workflow.id } })).rejects.toMatchObject({ code: 'RUN_CANCEL_RUNTIME_ACTIVE', statusCode: 409 })
    expect(await f.executions()).toEqual(executionState)
    expect(await db.compositeAssessmentAttempt.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).toEqual(parentState)
    expect(await writes(ids[0])).toEqual(before[0]); expect(await writes(ids[1])).toEqual(before[1])
    await expect(submitCompositeFormSectionFinal(inputs[1])).rejects.toMatchObject({ code: 'RUN_ACTOR_AUTHORITY_REVOKED' })
    expect(await writes(ids[1])).toEqual(before[1])
  }, 120_000)
  it('rejects observer FINAL after exact assignment revocation or actual parent-child relationship revocation', async () => {
    const f = await setupPrivateFormExecutionFixture(db, 'SCHOOL', 'PARENT_REPORT', 2), executions = await f.executions()
    const ids: string[] = [], inputs: SectionSubmitInput[] = []
    for (const execution of executions) {
      await acceptRunExecutionConsent({ executionId: execution.id, actorUserId: f.participantUserId })
      const id = await started(execution.id, f.participantUserId); ids.push(id); inputs.push(await currentInput(id, f.participantUserId))
    }
    const before = [await writes(ids[0]), await writes(ids[1])]
    const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ids[0] } })
    if (!parent.assignmentRef) throw new Error('Actual START must persist assignment binding')
    await createRelationalAssessmentService(createSqlRelationalAssignmentRepository(db)).revoke({ assignmentId: parent.assignmentRef, actorUserId: f.participantUserId })
    await expect(submitCompositeFormSectionFinal(inputs[0])).rejects.toMatchObject({ code: 'PRIVATE_FORM_EXECUTION_BINDING_INVALID' })
    expect(await writes(ids[0])).toEqual(before[0])
    const relationship = await db.parentStudentRelationship.findFirstOrThrow({ where: { parentUserId: f.participantUserId, studentUserId: f.subjectUserId, status: 'ACTIVE' } })
    await parentPortalService.revoke({ userId: f.participantUserId, role: 'PARENT', platformRole: 'STANDARD' }, relationship.id, 'Synthetic relationship revocation')
    await expect(submitCompositeFormSectionFinal(inputs[1])).rejects.toMatchObject({ code: 'RUN_PARENT_ORGANIZATION_TETHER_REVOKED' })
    expect(await writes(ids[1])).toEqual(before[1])
  }, 120_000)
})
