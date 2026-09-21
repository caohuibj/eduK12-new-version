import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'

const DB_URL = integrationDatabaseUrl('SCALE_PR3_INTEGRATION_DATABASE_URL', 'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
const key = 'synthetic_pr3_eligibility'
const authId = randomUUID()
vi.mock('../../modules/scale/onboarding/instrument-registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/scale/onboarding/instrument-registry')>()
  const { compileScalePolicy } = await import('../../modules/scale/policy/compile')
  const { DISCLOSURE_PRESETS } = await import('../../modules/scale/policy/disclosure')
  const source = structuredClone(actual.getScaleInstrumentSource('adexi_v1', '2.0.0')!)
  source.identity = { instrumentKey: 'synthetic_pr3_eligibility', instrumentVersion: '1.0.0' }
  source.executable!.references = []
  source.executable!.definition.referencePolicy = { type: 'none' } as any
  source.applicability = { schemaVersion: 1, policyVersion: '1', respondentTypes: ['SELF'], requiredContextKeys: [], subject: { ageMonths: { minInclusive: 168 } } }
  source.disclosure!.audiences.respondent = DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()
  source.educationalFeedback = { schemaVersion: 1, contentVersion: '1', blocks: [{ id: 'help', body: 'Synthetic educational feedback' }] }
  return { ...actual,
    getScaleInstrumentSource: (k: string, v: string) => k === source.identity.instrumentKey ? source : actual.getScaleInstrumentSource(k, v),
    getScaleInstrumentRuntimePolicy: (k: string, v: string) => k === source.identity.instrumentKey ? compileScalePolicy(source) : actual.getScaleInstrumentRuntimePolicy(k, v),
  }
})
vi.mock('../../modules/scale/scale-package.registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/scale/scale-package.registry')>()
  return { ...actual, getScalePackage: (k: string, v: string) => {
    if (k !== 'synthetic_pr3_eligibility') return actual.getScalePackage(k, v)
    const pkg = structuredClone(actual.getScalePackage('adexi_v1', '2.0.0')!)
    pkg.key = k; pkg.instrumentVersion = v; pkg.references = []; pkg.definition.referencePolicy = { type: 'none' } as any
    return pkg
  } }
})

let db: PrismaClient
let server: Server
let base = ''
let actor = ''
let scaleId = ''
let install: typeof import('../../modules/scale/onboarding/install')
let source: any
let input: any
let admissionModule: typeof import('../../modules/scale/scale-admission.service')
const request = async (body: unknown = {}) => {
  const response = await fetch(`${base}/scales/${scaleId}/assessments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() as any }
}

suite('PR3 managed installation and HTTP admission (isolated PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'b'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'c'.repeat(64)
    db = (await import('../../config/database')).prisma
    install = await import('../../modules/scale/onboarding/install')
    admissionModule = await import('../../modules/scale/scale-admission.service')
    const registry = await import('../../modules/scale/onboarding/instrument-registry')
    source = registry.getScaleInstrumentSource(key, '1.0.0')!
    actor = (await db.user.create({ data: { username: `pr3-${randomUUID()}`, passwordHash: 'test-only', role: 'STUDENT' } })).id
    await db.instrumentAuthorization.create({ data: {
      authorizationKey: authId, version: 1, instrumentKey: key, instrumentVersion: '1.0.0', grantor: 'test', grantee: 'test',
      electronicAdministration: true, scoring: true, display: true, translation: true, territories: ['CN'], locales: ['zh-CN'], commercialNature: 'NON_COMMERCIAL',
      validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'), basis: 'test-only', status: 'APPROVED',
      approvedByUserId: actor, approvedAt: new Date(), createdByUserId: actor, recordHash: 'a'.repeat(64),
    } })
    input = { instrumentKey: key, instrumentVersion: '1.0.0', actorUserId: actor, deploymentPolicy: {
      schemaVersion: 1, revision: 1, locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL',
      deploymentModes: ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'], requiredRightsActions: ['electronicAdministration', 'scoring', 'display'],
      authorizationRefs: [authId], runtimePolicyHash: registry.getScaleInstrumentRuntimePolicy(key, '1.0.0')!.runtimePolicyHash,
      localizationVersion: source.localization.localizationVersion, inFlightCompletion: 'FROZEN_DEADLINE', completionWindowMs: 86400000,
    } }
    const app = express(); app.use(express.json())
    app.use((req, _res, next) => { req.user = { userId: actor, role: 'STUDENT' } as any; next() })
    app.post('/scales/:scaleId/assessments', (await import('../../modules/scale/scale-start.controller')).startStandaloneScaleAssessment)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as any).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    if (!db) return
    if (scaleId) {
      await db.assessment.deleteMany({ where: { scaleId } })
      await db.$executeRaw`DELETE FROM "scale_deployment_policies" WHERE "scale_id" = ${scaleId}`
      await db.scale.delete({ where: { id: scaleId } })
    }
    await db.instrumentAuthorization.deleteMany({ where: { instrumentKey: key } })
    if (actor) await db.user.delete({ where: { id: actor } })
    await db.$disconnect()
  })

  it('dry-runs, installs DRAFT/HIDDEN, and reapplies without resetting lifecycle', async () => {
    expect((await install.planScaleInstrumentInstall(db, input)).createScale).toBe(true)
    await install.installScaleInstrument(db, input)
    const row = await db.scale.findUniqueOrThrow({ where: { code: key } }); scaleId = row.id
    expect(row).toMatchObject({ status: 'DRAFT', visibility: 'HIDDEN', creatorId: actor })
    await db.scale.update({ where: { id: scaleId }, data: { status: 'PUBLISHED', visibility: 'PUBLIC' } })
    expect((await install.installScaleInstrument(db, input)).deploymentAlreadyActive).toBe(true)
    expect(await db.scale.findUnique({ where: { id: scaleId } })).toMatchObject({ status: 'PUBLISHED', visibility: 'PUBLIC', creatorId: actor })
  })

  it('returns context preflight without questions or a persisted attempt', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({ preflight: { kind: 'CONTEXT_REQUIRED', requiredContextKeys: ['birthYearMonth'] } })
    expect(await db.assessment.count({ where: { scaleId } })).toBe(0)
  })

  it('denies underage and direct-submit bypass without freezing a mutable denial', async () => {
    const response = await request({ context: { birthYearMonth: '2025-01' } })
    expect(response.status).toBe(409)
    expect(await db.assessment.count({ where: { scaleId } })).toBe(0)
    const { freezeScaleRuntimeAtAttemptStart, encryptFrozenScaleRuntimeSnapshot } = await import('../../modules/assessment-runtime/runtime-snapshot')
    const runtime = await freezeScaleRuntimeAtAttemptStart(db, { instrumentKey: key, instrumentVersion: '1.0.0', definition: source.executable.definition })
    const child = await db.assessment.create({ data: {
      scaleId, userId: actor, runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtime), compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
    }, select: admissionModule.UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
    await expect(admissionModule.activateScaleAdmission(child)).rejects.toThrow()
    expect((await db.assessment.findUniqueOrThrow({ where: { id: child.id } })).frozenAdmissionSnapshotHash).toBeNull()
    await db.assessment.delete({ where: { id: child.id } })
  })

  it('freezes eligible facts once and preserves them on concurrent resume and grant revocation', async () => {
    const simultaneous = await Promise.all([request({ context: { birthYearMonth: '2000-01', gradeLevel: '12' } }), request({ context: { birthYearMonth: '2000-01' } })])
    expect(simultaneous.map(item => item.status)).toEqual([200, 200])
    expect(new Set(simultaneous.map(item => item.body.data.assessment.id)).size).toBe(1)
    const response = simultaneous[0]
    expect(response.status).toBe(200)
    const id = response.body.data.assessment.id
    const row = await db.assessment.findUniqueOrThrow({ where: { id } })
    const frozen = admissionModule.readStoredScaleAdmission(row)!
    expect(frozen.schemaVersion).toBe(2)
    expect(frozen.contextValues?.birthYearMonth).toBe('2000-01')
    expect(frozen.contextValues?.gradeLevel).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toContain('birthYearMonth')
    await db.instrumentAuthorization.updateMany({ where: { instrumentKey: key }, data: { status: 'REVOKED' } })
    const resumed = await Promise.all([request(), request({ context: { birthYearMonth: '2025-01' } })])
    expect(resumed.map(result => result.body.data.assessment.id)).toEqual([id, id])
    expect((await db.assessment.findUniqueOrThrow({ where: { id } })).frozenAdmissionSnapshotHash).toBe(row.frozenAdmissionSnapshotHash)
    await db.assessment.update({ where: { id }, data: { status: 'ABANDONED' } })
    expect((await request({ context: { birthYearMonth: '2000-01' } })).status).toBe(409)
    await db.instrumentAuthorization.updateMany({ where: { instrumentKey: key }, data: { status: 'APPROVED' } })
  })



  it('restarts with corrected facts atomically and rejects expired in-flight delivery', async () => {
    const started = await request({ context: { birthYearMonth: '2000-01' } })
    const originalId = started.body.data.assessment.id
    const { restartStandaloneScaleAssessmentWithPolicy } = await import('../../modules/scale/scale-restart.service')
    await expect(restartStandaloneScaleAssessmentWithPolicy(originalId, actor, { birthYearMonth: '2025-01' })).rejects.toThrow()
    expect((await db.assessment.findUniqueOrThrow({ where: { id: originalId } })).status).toBe('IN_PROGRESS')
    const replacement = await restartStandaloneScaleAssessmentWithPolicy(originalId, actor, { birthYearMonth: '2001-01' })
    expect(replacement.attemptEpoch).toBe(2)
    expect(replacement.id).not.toBe(originalId)
    expect((await db.assessment.findUniqueOrThrow({ where: { id: originalId } })).status).toBe('ABANDONED')
    expect(admissionModule.readStoredScaleAdmission(replacement)?.contextValues?.birthYearMonth).toBe('2001-01')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86400000)
    try { await expect(admissionModule.activateScaleAdmission(replacement as any)).rejects.toThrow('完成期限') }
    finally { clock.mockRestore() }
    await db.assessment.update({ where: { id: replacement.id }, data: { status: 'ABANDONED' } })
  })

  it('uses frozen eligibility for completion and replay while retaining full encrypted results', async () => {
    const started = await request({ context: { birthYearMonth: '2000-01' } })
    const assessment = started.body.data.assessment
    const payload = { assessmentId: assessment.id, userId: actor, submissionId: randomUUID(), attemptEpoch: assessment.attemptEpoch,
      definitionHash: started.body.data.scale.definitionHash, contextSnapshotHash: assessment.contextSnapshotHash,
      answers: source.executable.goldenCases[0].answers }
    const { submitUnifiedScaleAssessmentFinal } = await import('../../modules/scale/unified-final-submit.service')
    const child = await db.assessment.findUniqueOrThrow({ where: { id: assessment.id }, include: { scale: true } })
    await db.instrumentAuthorization.updateMany({ where: { instrumentKey: key }, data: { status: 'REVOKED' } })
    const completed = await submitUnifiedScaleAssessmentFinal(payload, child as any)
    expect(completed.replayed).toBe(false)
    expect(JSON.stringify(completed.assessment)).not.toContain('"scores"')
    const stored = await db.assessment.findUniqueOrThrow({ where: { id: assessment.id }, include: { scale: true } })
    expect(stored.result).toBeTruthy()
    const { decryptField } = await import('../../utils/encryption')
    expect(decryptField<any>(stored.result as string).scores.length).toBeGreaterThan(0)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2098-01-01'))
    try {
      const replay = await submitUnifiedScaleAssessmentFinal(payload, stored as any)
      expect(replay.replayed).toBe(true)
      expect(JSON.stringify(replay.assessment)).not.toContain('"scores"')
    } finally { clock.mockRestore() }
    await db.instrumentAuthorization.updateMany({ where: { instrumentKey: key }, data: { status: 'APPROVED' } })
  })

  it('evaluates subject facts, never respondent age, consistently across all four modes', async () => {
    const { freezeScaleRuntimeAtAttemptStart } = await import('../../modules/assessment-runtime/runtime-snapshot')
    const runtime = await freezeScaleRuntimeAtAttemptStart(db, { instrumentKey: key, instrumentVersion: '1.0.0', definition: source.executable.definition })
    const scale = await db.scale.findUniqueOrThrow({ where: { id: scaleId } })
    const { hashAssessmentContext } = await import('../../modules/assessment-context/context')
    for (const requestedMode of ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'] as const) {
      for (const age of [167, 168, undefined]) {
        const context = { schemaVersion: 1 as const, frozenAt: '2026-09-01T00:00:00.000Z', values: age === undefined ? {} : { ageMonthsAtFreeze: age, birthYearMonth: age === 168 ? '2012-09' : '2012-10' } }
        const snapshot = await admissionModule.createScaleAdmissionForRuntime({
          db, scale, runtime, attemptEpoch: 1, principal: { userId: actor, questionnaireSessionId: null, recoveryTokenHash: null }, parent: null,
          requestedMode, contextValues: context.values, contextSnapshotHash: hashAssessmentContext(context), contextFrozenAt: context.frozenAt,
          respondentType: 'SELF', subjectUserId: actor, respondentUserId: actor,
        })
        expect(snapshot.schemaVersion === 2 && snapshot.scalePolicy?.eligibility.outcome).toBe(age === undefined ? 'INDETERMINATE' : age === 168 ? 'ELIGIBLE' : 'INELIGIBLE')
      }
    }
  })


  it('freezes embedded questionnaire, public and composite admissions atomically after context collection', async () => {
    const { freezeScaleRuntimeAtAttemptStart, encryptFrozenScaleRuntimeSnapshot } = await import('../../modules/assessment-runtime/runtime-snapshot')
    const { freezeQuestionnaireActiveSlotSet, freezeCompositeActiveSlotSet } = await import('../../modules/assessment-runtime/attempt-runtime')
    const { encryptFrozenActiveSlotSet } = await import('../../modules/assessment-runtime/slot-set')
    const { hashAssessmentContext } = await import('../../modules/assessment-context/context')
    const { encryptAssessmentContext } = await import('../../modules/assessment-context/security')
    const runtime = await freezeScaleRuntimeAtAttemptStart(db, { instrumentKey: key, instrumentVersion: '1.0.0', definition: source.executable.definition })
    const context = { schemaVersion: 1 as const, frozenAt: new Date().toISOString(), values: { birthYearMonth: '2000-01' } }
    for (const mode of ['QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'] as const) {
      const composite = mode === 'COMPOSITE'
      const owner = composite
        ? await db.compositeAssessment.create({ data: { code: `pr3-${randomUUID()}`, name: 'Synthetic parent', createdBy: actor, status: 'PUBLISHED' } })
        : await db.questionnaire.create({ data: { code: `pr3-${randomUUID()}`, name: 'Synthetic parent', creatorId: actor, type: mode === 'PUBLIC_QUESTIONNAIRE' ? 'GENERAL' : 'COURSE', status: 'PUBLISHED' } })
      const slot = composite
        ? await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: owner.id, type: 'SCALE', scaleId, position: 0, required: true } })
        : await db.questionnaireScale.create({ data: { questionnaireId: owner.id, scaleId, position: 0 } })
      const scaleSlot = { code: key, instrumentVersion: '1.0.0', sourceDefinitionHash: runtime.sourceDefinitionHash, compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
        ...(composite ? { compositeItemId: slot.id } : { questionnaireScaleId: slot.id }) }
      const frozen = composite ? freezeCompositeActiveSlotSet({ attemptEpoch: 1, scales: [scaleSlot], cognitive: [], formSections: [] })
        : freezeQuestionnaireActiveSlotSet({ attemptEpoch: 1, scales: [scaleSlot], formSections: [] })
      const common = { userId: mode === 'PUBLIC_QUESTIONNAIRE' ? null : actor, deliveryMode: 'FINAL_ONLY' as const, runtimeGeneration: 'UNIFIED_V1' as const,
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen), frozenActiveSlotSetHash: frozen.snapshotHash }
      const parent = composite
        ? await db.compositeAssessmentAttempt.create({ data: { ...common, compositeAssessmentId: owner.id, participantKey: `user:${actor}` } })
        : await db.questionnaireAssessment.create({ data: { ...common, questionnaireId: owner.id, ...(mode === 'PUBLIC_QUESTIONNAIRE' ? { sessionId: randomUUID(), resumeTokenHash: randomUUID() } : {}) } })
      const child = await db.assessment.create({ data: {
        scaleId, userId: common.userId, deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', respondentType: 'SELF',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtime), compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
        ...(composite ? { compositeAttemptId: parent.id, compositeItemId: slot.id } : { questionnaireAssessmentId: parent.id }),
      }, select: admissionModule.UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
      try {
        await expect(admissionModule.activateScaleAdmission(child)).rejects.toThrow()
        expect((await db.assessment.findUniqueOrThrow({ where: { id: child.id } })).frozenAdmissionSnapshotHash).toBeNull()
        const data = { contextSnapshotEncrypted: encryptAssessmentContext(context), contextSnapshotHash: hashAssessmentContext(context) }
        if (composite) await db.compositeAssessmentAttempt.update({ where: { id: parent.id }, data })
        else await db.questionnaireAssessment.update({ where: { id: parent.id }, data })
        const decisions = await Promise.all([admissionModule.activateScaleAdmission(child), admissionModule.activateScaleAdmission(child)])
        expect(new Set(decisions.map(decision => decision.snapshotHash)).size).toBe(1)
        expect(decisions[0].governance.status).toBe('READY')
        expect(decisions[0].contextSnapshotHash).toBe(data.contextSnapshotHash)
        const saved = await db.assessment.findUniqueOrThrow({ where: { id: child.id }, select: admissionModule.UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
        expect((await admissionModule.activateScaleAdmission(saved)).snapshotHash).toBe(decisions[0].snapshotHash)
        await expect(admissionModule.activateScaleAdmission({ ...saved, subjectUserId: 'different-subject' })).rejects.toThrow('身份绑定')
      } finally {
        await db.assessment.delete({ where: { id: child.id } })
        if (composite) {
          await db.compositeAssessmentAttempt.delete({ where: { id: parent.id } })
          await db.compositeAssessmentItem.delete({ where: { id: slot.id } })
          await db.compositeAssessment.delete({ where: { id: owner.id } })
        } else {
          await db.questionnaireAssessment.delete({ where: { id: parent.id } })
          await db.questionnaireScale.delete({ where: { id: slot.id } })
          await db.questionnaire.delete({ where: { id: owner.id } })
        }
      }
    }
  })


  it('rolls back retirement when a replacement deployment cannot be written', async () => {
    await expect(install.installScaleInstrument(db, { ...input, actorUserId: randomUUID(), deploymentPolicy: { ...input.deploymentPolicy, revision: 2 } })).rejects.toThrow()
    const { readActiveScaleDeployment, readScaleDeploymentRevision } = await import('../../modules/scale/deployment/repository')
    expect((await readActiveScaleDeployment(db, scaleId))?.revision).toBe(1)
    expect(await readScaleDeploymentRevision(db, scaleId, 2)).toBeNull()
  })

  it('fails version/content conflicts without mutating stored deployment', async () => {
    await db.scale.update({ where: { id: scaleId }, data: { instrumentVersion: '9.0.0' } })
    expect((await install.planScaleInstrumentInstall(db, input)).blockers).toContain('DEPLOYMENT_VERSION_CONFLICT')
    await expect(install.installScaleInstrument(db, input)).rejects.toThrow('DEPLOYMENT_VERSION_CONFLICT')
    await db.scale.update({ where: { id: scaleId }, data: { instrumentVersion: '1.0.0' } })
  })
})
