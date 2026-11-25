import { writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma as appPrisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { commitCompositeWholeFinal, prepareCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
import {
  publicTemplates,
  publicTemplatesForDatabase,
  withCommittedStartTemplates,
} from '../../modules/assessment-runtime/public-templates'
import {
  isCompactTrainingContentBindingRef,
  resolveTrainingContentBindingParent,
  saveCompactTrainingContentBinding,
  type TrainingContentAttemptBinding,
} from '../../modules/composite/training-content-binding'
import { decodeTrainingFinalReceipt } from '../../modules/composite/training-content-final'
import {
  authorizeTrainingAuthenticatedWholeV2,
  resetWholeV2PlanCacheForTests,
} from '../../modules/composite/whole-v2.access'
import { publishContentRelease } from '../../modules/measurement-content/repository'
import { scaleMeasurementRelease } from '../../modules/measurement-content/scale'
import { review, submit } from '../../modules/scale-library-governance/service'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { grantLibraryUseFixture } from '../fixtures/library-distribution'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip

const hex = (v: string) => createHash('sha256').update(v).digest('hex')

suite('WHOLE_V2 convergence CHECK constraint, DB trigger parity & START->FINAL / real PostgreSQL', () => {
  let db: PrismaClient
  let adminId = ''
  let surveyOwnerId = ''
  let surveyProjectId = ''
  let teacherId = ''
  let courseId = ''
  let libraryScaleId = ''
  let libraryScaleId2 = ''

  const makeMetadata = (title: string) => ({
    title,
    author: 'Synthetic author',
    copyright: 'Self authored redistribution explicitly permitted',
    applicability: 'Synthetic research only',
    scoringDescription: 'Sum',
    reportDescription: 'Descriptive, no diagnosis',
  })
  const makeDefinition = (itemKey = 'item_1') => ({
    schemaVersion: 1 as const,
    presentationMode: 'ALL_AT_ONCE' as const,
    respondentType: 'participant_self_report' as const,
    aggregation: 'sum' as const,
    responseOptions: [
      { optionKey: 'one', label: '1', score: 1 },
      { optionKey: 'two', label: '2', score: 2 },
    ],
    dimensions: [{ dimensionKey: 'total', label: '总分', direction: 'descriptive' as const }],
    items: [{ itemKey, prompt: '问题', required: true, reverse: false, dimensionKeys: ['total'] }],
  })

  async function createGrantedLibraryScale(title: string, itemKey: string, size = 1): Promise<string> {
    const metadata = makeMetadata(title)
    const definition = makeDefinition(itemKey)
    if(size>1)definition.items=Array.from({length:size},(_,i)=>({...definition.items[0],itemKey:itemKey+'_'+i,prompt:'Synthetic reflection '+i}))
    const compiled = compileResearchScale(metadata.title, definition)
    const release = await db.$transaction(tx => publishContentRelease(
      tx,
      scaleMeasurementRelease({
        localId: randomUUID(),
        version: 'v1',
        instrumentVersion: '1',
        definition: compiled,
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        presentationMode: 'ALL_AT_ONCE',
        scope: { kind: 'PRIVATE', ownerId: surveyOwnerId, product: 'SURVEY', resourceId: surveyProjectId },
        provenance: {
          authoringRelationship: 'ORIGINAL',
          authoringSnapshot: {
            title: metadata.title,
            definition,
            instrumentClass: 'CUSTOM_DESCRIPTIVE',
            product: 'SURVEY',
          },
        },
      }),
      surveyOwnerId,
    ))
    const sub = await submit(surveyOwnerId, 'SURVEY', {
      requestId: randomUUID(),
      releaseId: release.releaseId,
      metadata,
    })
    const approved = await review(adminId, sub.id, {
      expectedVersion: 1,
      decision: 'APPROVE',
      allowedProducts: ['TRAINING', 'SURVEY'],
      reason: 'WHOLE_V2 convergence integration test',
    })
    await grantLibraryUseFixture(db, adminId, approved.entryId!, {
      requestId: randomUUID(),
      userId: teacherId,
      product: 'TRAINING',
    })
    const libScale = await db.scale.findUniqueOrThrow({ where: { libraryEntryId: approved.entryId! } })
    return libScale.id
  }

  async function createEnrolledStudent(suffix: string): Promise<string> {
    const student = await db.user.create({
      data: {
        username: `v2stu-${suffix}-${randomUUID().slice(0, 8)}`,
        passwordHash: 'synthetic',
        role: 'STUDENT',
        accountDomain: 'TRAINING',
      },
    })
    await db.courseStudent.create({
      data: { courseId, studentId: student.id, status: 'APPROVED' },
    })
    return student.id
  }

  beforeAll(async () => {
    if (!process.env.DATA_ENCRYPTION_KEY) vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    if (!process.env.DATA_PSEUDONYM_KEY) vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
    vi.stubEnv('COMPOSITE_WHOLE_V2_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')

    requireIsolatedReleaseDatabase(url!)
    db = appPrisma
    await db.$connect()

    const prefix = randomUUID().replaceAll('-', '').slice(0, 10)
    adminId = (await db.user.create({
      data: {
        username: `v2adm-${prefix}`,
        passwordHash: 'synthetic',
        role: 'ADMIN',
        platformRole: 'SYSTEM_ADMIN',
        accountDomain: 'LEGACY',
      },
    })).id

    const surveyUser = await db.user.create({
      data: {
        username: `v2srv-${prefix}`,
        passwordHash: 'synthetic',
        role: 'STUDENT',
        accountDomain: 'SURVEY',
      },
    })
    const login = `v2srv${prefix}`
    await db.surveyAccount.create({
      data: { userId: surveyUser.id, loginName: login, normalizedLogin: login },
    })
    await db.surveyResearcherGrant.create({
      data: { userId: surveyUser.id, status: 'ACTIVE', grantedBy: adminId },
    })
    await db.surveyMfaCredential.create({
      data: { userId: surveyUser.id, enabled: true, secretCipher: 'synthetic' },
    })
    surveyOwnerId = surveyUser.id

    surveyProjectId = randomUUID()
    await db.surveyProject.create({
      data: {
        id: surveyProjectId,
        ownerUserId: surveyOwnerId,
        title: `Synthetic WHOLE_V2 project ${prefix}`,
        collectionMode: 'SINGLE_UNLINKED',
      },
    })

    const teacher = await db.user.create({
      data: {
        username: `v2tch-${prefix}`,
        passwordHash: 'synthetic',
        role: 'TEACHER',
        teacherApproved: true,
        accountDomain: 'TRAINING',
      },
    })
    teacherId = teacher.id

    libraryScaleId = await createGrantedLibraryScale(`WHOLE_V2收敛量表A-${prefix}`, 'item_1')
    libraryScaleId2 = await createGrantedLibraryScale(`WHOLE_V2收敛量表B-${prefix}`, 'item_2')

    const course = await db.course.create({
      data: {
        title: `WHOLE_V2 Test Course ${prefix}`,
        courseCode: `v2c-${prefix}`,
        creatorId: teacherId,
        status: 'PUBLISHED',
        courseType: 'TRAINING_COURSE',
        isLibrary: false,
      },
    })
    courseId = course.id
  }, 120000)

  afterAll(async () => {
    resetWholeV2PlanCacheForTests()
    vi.unstubAllEnvs()
    if (db) {
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  })

  it('publishes a 303-question anonymous Training questionnaire with nine granted library scales', async () => {
    const runtime=await import('../../modules/composite/composite.service')
    const comp=await db.compositeAssessment.create({data:{code:'anon-303-'+randomUUID(),name:'Synthetic full anonymous START',createdBy:teacherId,
      productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',publicEnabled:true,expiresAt:new Date(Date.now()+7200000),maxAttempts:1,questionnaireCourses:{create:{courseId}}}})
    for(let i=0;i<9;i++){
      const scaleId=await createGrantedLibraryScale('Synthetic anonymous 303 source '+i,'q',i<6?34:33)
      await runtime.addItem(teacherId,'TEACHER',comp.id,{type:'SCALE',scaleId,required:true})
    }
    await runtime.publishComposite(teacherId,'TEACHER',comp.id)
    const token=await runtime.createAccessTokenForComposite(teacherId,'TEACHER',comp.id,new Date(Date.now()+3600000).toISOString(),0)
    expect(token.maxUses).toBe(0)
    const publicInfo = await runtime.getPublicCompositeInfo(token.token)
    expect(publicInfo.usedCount).toBe(0)
    expect(publicInfo.units).toHaveLength(9)
    expect(publicInfo.units.every(unit => unit.type === 'scale')).toBe(true)
    const published = await db.compositeAssessment.findUniqueOrThrow({
      where: { id: comp.id },
      select: { status: true, items: {
        orderBy: { position: 'asc' },
        select: { scale: { select: { definition: true } } },
      } },
    })
    expect(published.status).toBe('PUBLISHED')
    expect(published.items.map(({ scale }) =>
      (scale?.definition as { items?: unknown[] } | null)?.items?.length,
    )).toEqual([34, 34, 34, 34, 34, 34, 33, 33, 33])

    const benchmarkFixturePath = process.env.ANONYMOUS_303_FIXTURE
    if (benchmarkFixturePath) {
      writeFileSync(benchmarkFixturePath, JSON.stringify({
        compositeId: comp.id,
        tokenId: token.id,
        token: token.token,
        questions: 303,
        units: 9,
      }), { mode: 0o600 })
    }
  },120000)

  it('inserts TRAINING_CONTENT_BINDING_PLAN under DB CHECK constraint, hydrates cold-cache compact V2, and enforces all 3 PostgreSQL triggers', async () => {
    const comp = await db.compositeAssessment.create({
      data: {
        code: `v2-trig-${randomUUID().slice(0, 8)}`,
        name: 'WHOLE_V2 DB Trigger Parity Fixture',
        createdBy: teacherId,
        status: 'PUBLISHED',
      },
    })

    const mRel1 = randomUUID()
    const mRel2 = randomUUID()
    const refRel1 = randomUUID()
    const refContentHash = hex('ref-content-1')
    const refEntryKey = hex('ref-entry-1')

    const makeUnit = (itemId: string, scaleSeed: string, releaseId: string, withRefPolicy: boolean) => ({
      itemId,
      family: 'SCALE' as const,
      source: { kind: 'SCALE' as const, id: scaleSeed, ownerId: teacherId },
      measurement: {
        releaseId,
        contentHash: hex(`mc-${itemId}`),
        measurementHash: hex(`mm-${itemId}`),
      },
      ...(withRefPolicy
        ? {
            referencePolicy: {
              policyVersion: 'EXACT_POPULATION_PRIORITY_V1' as const,
              measurementReleaseId: releaseId,
              choices: [
                {
                  releaseId: refRel1,
                  contentHash: refContentHash,
                  entryKey: refEntryKey,
                  metricKey: 'total',
                  referenceKind: 'normative_distribution' as const,
                  priority: 1,
                },
              ],
            },
          }
        : {}),
    })

    const item1 = randomUUID()
    const item2 = randomUUID()
    const units: TrainingContentAttemptBinding['units'] = [
      makeUnit(item1, 'scale-1', mRel1, true),
      makeUnit(item2, 'scale-2', mRel2, false),
    ]
    const snapshot = { schemaVersion: 1, compositeId: comp.id, units }
    const snapshotHash = canonicalHash(snapshot)
    await db.$executeRaw`
      UPDATE composite_assessments
      SET training_content_snapshot = ${JSON.stringify(snapshot)}::jsonb,
          training_content_snapshot_hash = ${snapshotHash}
      WHERE id = ${comp.id}
    `

    const attempt1Id = randomUUID()
    const attempt2Id = randomUUID()
    const expanded1: TrainingContentAttemptBinding = {
      schemaVersion: 1,
      compositeId: comp.id,
      attemptId: attempt1Id,
      epoch: 1,
      publicationHash: snapshotHash,
      units,
    }
    const expanded2: TrainingContentAttemptBinding = {
      schemaVersion: 1,
      compositeId: comp.id,
      attemptId: attempt2Id,
      epoch: 1,
      publicationHash: snapshotHash,
      units,
    }

    // Commits 'TRAINING_CONTENT_BINDING_PLAN' into assessment_public_templates via real PostgreSQL CHECK constraint
    const saved1 = await withCommittedStartTemplates(
      work => db.$transaction(work),
      tx => saveCompactTrainingContentBinding(tx, expanded1),
    )
    const saved2 = await withCommittedStartTemplates(
      work => db.$transaction(work),
      tx => saveCompactTrainingContentBinding(tx, expanded2),
    )
    expect(saved1.storedBinding.templateHash).toBe(saved2.storedBinding.templateHash)
    expect(saved1.storedBinding.publicationHash).toBe(snapshotHash)

    const [tplRow] = await db.$queryRaw<Array<{ templateKind: string }>>`
      SELECT template_kind AS "templateKind"
      FROM assessment_public_templates
      WHERE template_hash = ${saved1.storedBinding.templateHash}
    `
    expect(tplRow?.templateKind).toBe('TRAINING_CONTENT_BINDING_PLAN')

    const v2PubHash = hex('whole-v2-plan-hash')

    // Negative guard_training_content_attempt() checks on real PostgreSQL
    await expect(db.$executeRaw`
      INSERT INTO composite_assessment_attempts(
        id, composite_assessment_id, user_id, participant_key, status, delivery_mode, runtime_generation,
        progress, completed_items, attempt_epoch, publication_hash,
        training_content_binding, training_content_binding_hash
      ) VALUES (
        ${randomUUID()}, ${comp.id}, ${teacherId}, ${`neg-tpl-${randomUUID()}`}, 'IN_PROGRESS', 'FINAL_ONLY', 'UNIFIED_V1',
        0, 0, 1, ${v2PubHash},
        ${JSON.stringify({ schemaVersion: 2, templateHash: hex('missing-template'), publicationHash: snapshotHash })}::jsonb,
        ${saved1.bindingHash}
      )
    `).rejects.toThrow(/compact binding template not committed/)

    await expect(db.$executeRaw`
      INSERT INTO composite_assessment_attempts(
        id, composite_assessment_id, user_id, participant_key, status, delivery_mode, runtime_generation,
        progress, completed_items, attempt_epoch, publication_hash,
        training_content_binding, training_content_binding_hash
      ) VALUES (
        ${randomUUID()}, ${comp.id}, ${teacherId}, ${`neg-pub-${randomUUID()}`}, 'IN_PROGRESS', 'FINAL_ONLY', 'UNIFIED_V1',
        0, 0, 1, ${v2PubHash},
        ${JSON.stringify({ schemaVersion: 2, templateHash: saved1.storedBinding.templateHash, publicationHash: hex('wrong-pub') })}::jsonb,
        ${saved1.bindingHash}
      )
    `).rejects.toThrow(/publication mismatch/)

    await expect(db.$executeRaw`
      INSERT INTO composite_assessment_attempts(
        id, composite_assessment_id, user_id, participant_key, status, delivery_mode, runtime_generation,
        progress, completed_items, attempt_epoch, publication_hash,
        training_content_binding, training_content_binding_hash,
        training_variant_allocation_encrypted, training_variant_allocation_hash
      ) VALUES (
        ${randomUUID()}, ${comp.id}, ${teacherId}, ${`neg-var-${randomUUID()}`}, 'IN_PROGRESS', 'FINAL_ONLY', 'UNIFIED_V1',
        0, 0, 1, ${v2PubHash},
        ${JSON.stringify(saved1.storedBinding)}::jsonb,
        ${saved1.bindingHash},
        'synthetic-cipher',
        ${hex('var-alloc')}
      )
    `).rejects.toThrow(/publication mismatch/)

    // Positive INSERT of two compact V2 attempts sharing the single template row
    for (const [id, binding, bindingHash] of [
      [attempt1Id, saved1.storedBinding, saved1.bindingHash],
      [attempt2Id, saved2.storedBinding, saved2.bindingHash],
    ] as const) {
      await db.$executeRaw`
        INSERT INTO composite_assessment_attempts(
          id, composite_assessment_id, user_id, participant_key, status, delivery_mode, runtime_generation,
          progress, completed_items, attempt_epoch, publication_hash, delivery_course_id,
          training_content_binding, training_content_binding_hash
        ) VALUES (
          ${id}, ${comp.id}, ${teacherId}, ${`v2ok-${id}`}, 'IN_PROGRESS', 'FINAL_ONLY', 'UNIFIED_V1',
          0, 0, 1, ${v2PubHash}, ${courseId},
          ${JSON.stringify(binding)}::jsonb, ${bindingHash}
        )
      `
    }

    // Force a true cold-cache PostgreSQL read from assessment_public_templates
    const rawParent1 = await db.compositeAssessmentAttempt.findUniqueOrThrow({
      where: { id: attempt1Id },
      select: { id: true, attemptEpoch: true, trainingContentBinding: true, trainingContentBindingHash: true },
    })
    const querySpy = vi.fn(db.$queryRaw.bind(db))
    const coldStore = publicTemplatesForDatabase({ $queryRaw: querySpy } as any)
    const getSpy = vi.spyOn(publicTemplates, 'get').mockReturnValue(undefined)
    let coldHydrated: any
    try {
      coldHydrated = await resolveTrainingContentBindingParent(
        db,
        { id: rawParent1.id, attemptEpoch: rawParent1.attemptEpoch, trainingContentBinding: saved1.storedBinding },
        coldStore,
      )
    } finally {
      getSpy.mockRestore()
    }
    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(coldHydrated.trainingContentBinding).toEqual(expanded1)
    expect(canonicalHash(coldHydrated.trainingContentBinding)).toBe(rawParent1.trainingContentBindingHash)

    // guard_training_reference_binding() positive + negative bounds (exact unit count = 2, no <= relaxation)
    const badShortRef = {
      schemaVersion: 1,
      attemptId: attempt1Id,
      epoch: 1,
      contentBindingHash: saved1.bindingHash,
      contextHash: null,
      units: [
        {
          itemId: item1,
          references: [
            {
              metricKey: 'total',
              referenceKind: 'normative_distribution',
              status: 'SELECTED',
              releaseId: refRel1,
              contentHash: refContentHash,
              entryKey: refEntryKey,
            },
          ],
        },
      ],
    }
    await expect(db.$executeRaw`
      UPDATE composite_assessment_attempts
      SET training_reference_binding = ${JSON.stringify(badShortRef)}::jsonb,
          training_reference_binding_hash = ${canonicalHash(badShortRef)}
      WHERE id = ${attempt1Id}
    `).rejects.toThrow(/context identity mismatch/)

    const badChoiceRef = {
      schemaVersion: 1,
      attemptId: attempt1Id,
      epoch: 1,
      contentBindingHash: saved1.bindingHash,
      contextHash: null,
      units: [
        {
          itemId: item1,
          references: [
            {
              metricKey: 'total',
              referenceKind: 'normative_distribution',
              status: 'SELECTED',
              releaseId: randomUUID(),
              contentHash: refContentHash,
              entryKey: refEntryKey,
            },
          ],
        },
        { itemId: item2, references: [] },
      ],
    }
    await expect(db.$executeRaw`
      UPDATE composite_assessment_attempts
      SET training_reference_binding = ${JSON.stringify(badChoiceRef)}::jsonb,
          training_reference_binding_hash = ${canonicalHash(badChoiceRef)}
      WHERE id = ${attempt1Id}
    `).rejects.toThrow(/outside frozen publication/)

    const validRef = {
      schemaVersion: 1,
      attemptId: attempt1Id,
      epoch: 1,
      contentBindingHash: saved1.bindingHash,
      contextHash: null,
      units: [
        {
          itemId: item1,
          references: [
            {
              metricKey: 'total',
              referenceKind: 'normative_distribution',
              status: 'SELECTED',
              releaseId: refRel1,
              contentHash: refContentHash,
              entryKey: refEntryKey,
            },
          ],
        },
        { itemId: item2, references: [] },
      ],
    }
    await db.$executeRaw`
      UPDATE composite_assessment_attempts
      SET training_reference_binding = ${JSON.stringify(validRef)}::jsonb,
          training_reference_binding_hash = ${canonicalHash(validRef)}
      WHERE id = ${attempt1Id}
    `

    // guard_training_interpretation_artifact() positive + negative bounds on COMPLETED compact V2 parent
    const aggHash = hex('agg-1')
    const receiptHash = hex('receipt-1')
    await db.$executeRaw`
      UPDATE composite_assessment_attempts
      SET status = 'COMPLETED',
          completed_at = now(),
          aggregate_input_hash = ${aggHash},
          training_content_interpretation_encrypted = 'synthetic-receipt-cipher',
          training_content_interpretation_hash = ${receiptHash}
      WHERE id = ${attempt1Id}
    `

    await expect(db.$executeRaw`
      INSERT INTO training_interpretation_artifacts(
        id, course_id, composite_id, attempt_id, attempt_epoch, item_id, created_by,
        request_hash, source_aggregate_hash, source_binding_hash, source_receipt_hash,
        artifact_cipher, artifact_hash
      ) VALUES (
        ${randomUUID()}, ${courseId}, ${comp.id}, ${attempt1Id}, 1, ${randomUUID()}, ${teacherId},
        ${hex('req-bad')}, ${aggHash}, ${saved1.bindingHash}, ${receiptHash},
        'synthetic-artifact', ${hex('art-bad')}
      )
    `).rejects.toThrow(/source identity mismatch/)

    await db.$executeRaw`
      INSERT INTO training_interpretation_artifacts(
        id, course_id, composite_id, attempt_id, attempt_epoch, item_id, created_by,
        request_hash, source_aggregate_hash, source_binding_hash, source_receipt_hash,
        artifact_cipher, artifact_hash
      ) VALUES (
        ${randomUUID()}, ${courseId}, ${comp.id}, ${attempt1Id}, 1, ${item1}, ${teacherId},
        ${hex('req-ok')}, ${aggHash}, ${saved1.bindingHash}, ${receiptHash},
        'synthetic-artifact', ${hex('art-ok')}
      )
    `
  }, 60000)

  it('completes real PostgreSQL WHOLE_V2 START -> SUBMIT -> FINAL receipt on compact V2 parent with zero child rows', async () => {
    const compositeService = await import('../../modules/composite/composite.service')
    const draft = await db.compositeAssessment.create({
      data: {
        code: `v2-e2e-${randomUUID().slice(0, 8)}`,
        name: 'WHOLE_V2 Real PG End-to-End Questionnaire',
        createdBy: teacherId,
        productKind: 'QUESTIONNAIRE',
        questionnaireType: 'COURSE',
        status: 'DRAFT',
        maxAttempts: 1,
        trainingFeedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},
        trainingFeedbackPolicyHash:canonicalHash({schemaVersion:1,mode:'IMMEDIATE'}),
        questionnaireCourses: { create: { courseId } },
      },
    })

    await compositeService.addItem(teacherId, 'TEACHER', draft.id, {
      type: 'SCALE',
      scaleId: libraryScaleId,
      required: true,
    })
    await compositeService.publishComposite(teacherId, 'TEACHER', draft.id)

    const published = await db.compositeAssessment.findUniqueOrThrow({ where: { id: draft.id } })
    const item = await db.compositeAssessmentItem.findFirstOrThrow({ where: { compositeAssessmentId: draft.id } })
    const studentId = await createEnrolledStudent('e2e')

    const started = await compositeService.startUserAttempt(studentId, draft.id)
    expect(started.attempt.executionMode).toBe('WHOLE_V2')

    // Verify zero child rows + compact V2 parent reference
    const [childAssessments, childForms, childCog, childSjt] = await Promise.all([
      db.assessment.count({ where: { compositeAttemptId: started.attempt.id } }),
      db.compositeFormSectionAttempt.count({ where: { attemptId: started.attempt.id } }),
      db.cognitiveSession.count({ where: { compositeAttemptId: started.attempt.id } }),
      db.situationalAttempt.count({ where: { compositeAttemptId: started.attempt.id } }),
    ])
    expect(childAssessments + childForms + childCog + childSjt).toBe(0)

    const dbAttempt = await db.compositeAssessmentAttempt.findUniqueOrThrow({
      where: { id: started.attempt.id },
    })
    expect(dbAttempt.trainingFeedbackSnapshot).toMatchObject({schemaVersion:2})
    expect(dbAttempt.trainingFeedbackSnapshot).not.toHaveProperty('policy')
    expect(dbAttempt.trainingFeedbackSnapshot).not.toHaveProperty('publicationIdentity')
    const {readTrainingFeedbackSnapshot}=await import('../../modules/composite/training-feedback-binding')
    const fullFeedback=readTrainingFeedbackSnapshot({...dbAttempt,compositeAssessment:published})!
    expect(canonicalHash(fullFeedback)).toBe(dbAttempt.trainingFeedbackSnapshotHash)
    expect(Buffer.byteLength(JSON.stringify(dbAttempt.trainingFeedbackSnapshot))).toBeLessThan(Buffer.byteLength(JSON.stringify(fullFeedback)))
    expect(dbAttempt.publicationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(dbAttempt.trainingContentBinding).toMatchObject({
      schemaVersion: 2,
      templateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      publicationHash: published.trainingContentSnapshotHash,
    })
    expect('units' in (dbAttempt.trainingContentBinding as Record<string, unknown>)).toBe(false)
    expect(Buffer.byteLength(JSON.stringify(dbAttempt.trainingContentBinding), 'utf8')).toBeLessThan(200)

    // Real WHOLE_V2 FINAL authorization & PostgreSQL atomic commit
    const authorized = await authorizeTrainingAuthenticatedWholeV2({
      params: { attemptId: started.attempt.id },
      user: { userId: studentId },
    } as any)
    expect(authorized.finalizeGovernanceInTx).toBeDefined()

    const slot = authorized.plan.slots.find(s => s.unitType === 'SCALE')!
    const submissionId = `v2-e2e-${randomUUID()}`
    const finalInput = {
      ...authorized,
      submit: {
        submissionId,
        attemptEpoch: authorized.attempt.attemptEpoch,
        publicationHash: authorized.plan.publicationHash,
        slotSetHash: authorized.plan.slotSetHash,
        units: {
          [slot.slotKey]: {
            unitType: 'SCALE' as const,
            definitionHash: slot.definitionHash,
            answers: [{ itemCode: 'item_1', responseValue: 'two' }],
          },
        },
      },
    }
    const prepared = await prepareCompositeWholeFinal(finalInput, db)
    expect(prepared).toBeDefined()
    const finalRes = await db.$transaction(tx => commitCompositeWholeFinal(tx, finalInput, prepared))
    expect(finalRes.status).toBe('COMPLETED')
    expect(finalRes.replayed).toBe(false)

    // Idempotent replay succeeds cleanly
    const replayRes = await db.$transaction(tx => commitCompositeWholeFinal(tx, {
      ...authorized,
      submit: {
        submissionId,
        attemptEpoch: authorized.attempt.attemptEpoch,
        publicationHash: authorized.plan.publicationHash,
        slotSetHash: authorized.plan.slotSetHash,
        units: {
          [slot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: slot.definitionHash,
            answers: [{ itemCode: 'item_1', responseValue: 'two' }],
          },
        },
      },
    }))
    expect(replayRes.replayed).toBe(true)

    const completedParent = await db.compositeAssessmentAttempt.findUniqueOrThrow({
      where: { id: started.attempt.id },
    })
    expect(completedParent.status).toBe('COMPLETED')
    expect(completedParent.trainingContentInterpretationHash).toMatch(/^[a-f0-9]{64}$/)

    const hydratedCompleted = await resolveTrainingContentBindingParent(db, completedParent)
    const decodedReceipt = decodeTrainingFinalReceipt(hydratedCompleted)!
    expect(decodedReceipt.sources).toHaveLength(1)
    expect(decodedReceipt.sources[0].itemId).toBe(item.id)
    expect(decodedReceipt.contentBindingHash).toBe(completedParent.trainingContentBindingHash)
    expect(canonicalHash(decodedReceipt)).toBe(completedParent.trainingContentInterpretationHash)
  }, 60000)

  it('keeps probabilistic variants on WHOLE_V2 with inline V1 binding so DB triggers strictly isolate unselected items', async () => {
    const compositeService = await import('../../modules/composite/composite.service')
    const draft = await db.compositeAssessment.create({
      data: {
        code: `v2-var-${randomUUID().slice(0, 8)}`,
        name: 'WHOLE_V2 Probabilistic Variant Questionnaire',
        createdBy: teacherId,
        productKind: 'QUESTIONNAIRE',
        questionnaireType: 'COURSE',
        status: 'DRAFT',
        maxAttempts: 1,
        questionnaireCourses: { create: { courseId } },
      },
    })

    const itemA = await compositeService.addItem(teacherId, 'TEACHER', draft.id, {
      type: 'SCALE',
      scaleId: libraryScaleId,
      required: true,
    })
    const itemB = await compositeService.addItem(teacherId, 'TEACHER', draft.id, {
      type: 'SCALE',
      scaleId: libraryScaleId2,
      required: true,
    })
    await db.compositeAssessment.update({
      where: { id: draft.id },
      data: {
        trainingVariantDraft: {
          schemaVersion: 1,
          groups: [
            { variantKey: 'group_a', label: 'A', weight: 1, units: [{ type: 'ITEM', id: itemA.id }] },
            { variantKey: 'group_b', label: 'B', weight: 1, units: [{ type: 'ITEM', id: itemB.id }] },
          ],
        },
      },
    })
    await compositeService.publishComposite(teacherId, 'TEACHER', draft.id)

    const published = await db.compositeAssessment.findUniqueOrThrow({ where: { id: draft.id } })
    expect(published.trainingVariantDigest).toMatch(/^[a-f0-9]{64}$/)
    expect((published.trainingContentSnapshot as any)?.units).toHaveLength(2)

    const studentId = await createEnrolledStudent('variant')
    const started = await compositeService.startUserAttempt(studentId, draft.id)
    expect(started.attempt.executionMode).toBe('WHOLE_V2')
    expect(started.attempt.totalItems).toBe(1)
    const dbAttempt = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: started.attempt.id } })

    expect(dbAttempt.publicationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(dbAttempt.trainingVariantAllocationEncrypted).toBeTruthy()
    expect(dbAttempt.trainingVariantAllocationHash).toMatch(/^[a-f0-9]{64}$/)

    // Probabilistic variants MUST remain inline V1 (never compact V2) with strictly the 1 selected item
    expect(isCompactTrainingContentBindingRef(dbAttempt.trainingContentBinding)).toBe(false)
    const inlineBinding = dbAttempt.trainingContentBinding as unknown as TrainingContentAttemptBinding
    expect(inlineBinding.schemaVersion).toBe(1)
    expect(inlineBinding.units).toHaveLength(1)

    const selectedItemId = inlineBinding.units[0].itemId
    const unselectedItemId = selectedItemId === itemA.id ? itemB.id : itemA.id
    const selectedItemKey = selectedItemId === itemA.id ? 'item_1' : 'item_2'

    // Authorize & submit only the selected variant slot through WHOLE_V2 FINAL
    const authorized = await authorizeTrainingAuthenticatedWholeV2({
      params: { attemptId: started.attempt.id },
      user: { userId: studentId },
    } as any)
    expect(authorized.activeSlotKeys?.size).toBe(1)
    const selectedSlotKey = [...authorized.activeSlotKeys!][0]
    const slot = authorized.plan.slots.find(s => s.slotKey === selectedSlotKey)!

    const finalRes = await db.$transaction(tx => commitCompositeWholeFinal(tx, {
      ...authorized,
      submit: {
        submissionId: `v2-var-${randomUUID()}`,
        attemptEpoch: authorized.attempt.attemptEpoch,
        publicationHash: authorized.plan.publicationHash,
        slotSetHash: authorized.plan.slotSetHash,
        units: {
          [slot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: slot.definitionHash,
            answers: [{ itemCode: selectedItemKey, responseValue: 'two' }],
          },
        },
      },
    }))
    expect(finalRes.status).toBe('COMPLETED')

    const completedParent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: started.attempt.id } })

    // PG trigger guard_training_interpretation_artifact() rejects the unselected variant item
    await expect(db.$executeRaw`
      INSERT INTO training_interpretation_artifacts(
        id, course_id, composite_id, attempt_id, attempt_epoch, item_id, created_by,
        request_hash, source_aggregate_hash, source_binding_hash, source_receipt_hash,
        artifact_cipher, artifact_hash
      ) VALUES (
        ${randomUUID()}, ${courseId}, ${draft.id}, ${started.attempt.id}, 1, ${unselectedItemId}, ${teacherId},
        ${hex('var-req-bad')}, ${completedParent.aggregateInputHash}, ${completedParent.trainingContentBindingHash},
        ${completedParent.trainingContentInterpretationHash},
        'synthetic-artifact', ${hex('var-art-bad')}
      )
    `).rejects.toThrow(/source identity mismatch/)

    // While accepting the drawn variant item
    await db.$executeRaw`
      INSERT INTO training_interpretation_artifacts(
        id, course_id, composite_id, attempt_id, attempt_epoch, item_id, created_by,
        request_hash, source_aggregate_hash, source_binding_hash, source_receipt_hash,
        artifact_cipher, artifact_hash
      ) VALUES (
        ${randomUUID()}, ${courseId}, ${draft.id}, ${started.attempt.id}, 1, ${selectedItemId}, ${teacherId},
        ${hex('var-req-ok')}, ${completedParent.aggregateInputHash}, ${completedParent.trainingContentBindingHash},
        ${completedParent.trainingContentInterpretationHash},
        'synthetic-artifact', ${hex('var-art-ok')}
      )
    `
  }, 60000)
})
