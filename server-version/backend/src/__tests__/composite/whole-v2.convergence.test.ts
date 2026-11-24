import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  buildCompositePublicationPlan,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { commitCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
import * as compositeFinalBridge from '../../modules/assessment-runtime/composite-final.bridge'
import { decryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import {
  createPublicTemplateStore,
  publicTemplates,
  type PublicTemplateRow,
} from '../../modules/assessment-runtime/public-templates'
import {
  isCompactTrainingContentBindingRef,
  resolveTrainingContentBindingParent,
  saveCompactTrainingContentBinding,
  tryResolveTrainingContentBindingSync,
  type TrainingContentAttemptBinding,
} from '../../modules/composite/training-content-binding'
import { trainingBoundContent } from '../../modules/composite/training-reference-binding'
import { prepareTrainingFinalReceipt } from '../../modules/composite/training-content-final'
import { DECLARATIVE_REPORT_GENERATOR } from '../../modules/measurement-content/report-renderer'
import * as measurementRepo from '../../modules/measurement-content/repository'
import * as compositionExec from '../../modules/assessment-run/educationCompositionExecution'
import * as declaredFeedbackMod from '../../modules/reporting/education-ordinary-declared-feedback'
import * as respondentSummaryMod from '../../modules/reporting/respondentSummary'
import { readSchoolOrdinaryFeedback } from '../../modules/reporting/education-ordinary-feedback.service'
import { assertCurrentRunStartAuthority } from '../../modules/assessment-run/startAuthority'
import { buildFourFamilyTestSlots } from '../assessment-runtime/phase2-test-fixtures'

const sha = (seed: string) => createHash('sha256').update(seed).digest('hex')

const sqlTextOf = (sql: any): string => (
  Array.isArray(sql)
    ? sql.join('?')
    : Array.isArray(sql?.strings)
      ? sql.strings.join('?')
      : String(sql?.sql ?? '')
)

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

function makeFinalDb(publicationHash: string) {
  const finals = new Map<string, any>()
  const finalsBySub = new Map<string, any>()
  const parentState = { status: 'IN_PROGRESS', attemptEpoch: 1, publicationHash }
  const executedSqls: string[] = []
  const db: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
      if (text.includes('FROM composite_assessment_attempts')) return [{ ...parentState }]
      if (text.includes('FROM composite_attempt_finals') && text.includes('submission_id =')) {
        const [attemptId, attemptEpoch, submissionId] = sql.values
        const row = finals.get(`${attemptId}:${attemptEpoch}`) ?? finalsBySub.get(submissionId)
        return row ? [row] : []
      }
      if (text.includes('FROM composite_attempt_finals')) {
        const [attemptId, attemptEpoch] = sql.values
        const row = finals.get(`${attemptId}:${attemptEpoch}`)
        return row ? [row] : []
      }
      if (text.includes('FROM composite_attempt_checkpoints')) return []
      return []
    }),
    $executeRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
      if (text.includes('INSERT INTO composite_attempt_finals')) {
        const [
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          pubHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        ] = sql.values
        const row = {
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          publicationHash: pubHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        }
        finals.set(`${attemptId}:${attemptEpoch}`, row)
        finalsBySub.set(submissionId, row)
        return 1
      }
      if (text.includes('UPDATE composite_assessment_attempts')) {
        parentState.status = 'COMPLETED'
        return 1
      }
      return 1
    }),
  }
  return { db, finals, executedSqls }
}

describe('Phase 2 WHOLE_V2 storage & hot-path convergence', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('deduplicates training_content_binding into TRAINING_CONTENT_BINDING_PLAN with exact expanded hash parity across attempts', async () => {
    const { store, repo, rows } = makeTemplateStore()
    const compositeId = randomUUID()
    const ownerId = randomUUID()
    const scaleId = randomUUID()
    const releaseId = randomUUID()
    const reportReleaseId = randomUUID()
    const pubHash = sha('pub-snapshot')
    const baseUnits: TrainingContentAttemptBinding['units'] = [
      {
        itemId: randomUUID(),
        family: 'SCALE',
        source: { kind: 'SCALE', id: scaleId, ownerId },
        measurement: { releaseId, contentHash: sha('m-content'), measurementHash: sha('m-def') },
        report: { releaseId: reportReleaseId, contentHash: sha('r-content') },
      },
    ]
    const expanded1: TrainingContentAttemptBinding = {
      schemaVersion: 1,
      compositeId,
      attemptId: randomUUID(),
      epoch: 1,
      publicationHash: pubHash,
      units: baseUnits,
    }
    const expanded2: TrainingContentAttemptBinding = {
      schemaVersion: 1,
      compositeId,
      attemptId: randomUUID(),
      epoch: 2,
      publicationHash: pubHash,
      units: baseUnits,
    }

    const compact1 = await saveCompactTrainingContentBinding(undefined, expanded1, store)
    const compact2 = await saveCompactTrainingContentBinding(undefined, expanded2, store)

    expect(compact1.storedBinding.schemaVersion).toBe(2)
    expect(compact1.storedBinding.templateHash).toBe(compact2.storedBinding.templateHash)
    expect(compact1.storedBinding.publicationHash).toBe(pubHash)
    expect(rows.size).toBe(1)
    expect(Buffer.byteLength(JSON.stringify(compact1.storedBinding), 'utf8')).toBeLessThan(200)
    expect(compact1.bindingHash).toBe(canonicalHash(expanded1))
    expect(compact2.bindingHash).toBe(canonicalHash(expanded2))
    expect(compact1.bindingHash).not.toBe(compact2.bindingHash)
    expect(isCompactTrainingContentBindingRef(compact1.storedBinding)).toBe(true)
    expect(isCompactTrainingContentBindingRef(expanded1)).toBe(false)

    // Hydrate both attempts using the single shared template
    const hydrated1 = await resolveTrainingContentBindingParent(
      undefined,
      { id: expanded1.attemptId, attemptEpoch: 1, trainingContentBinding: compact1.storedBinding },
      store,
    )
    const hydrated2 = await resolveTrainingContentBindingParent(
      undefined,
      { id: expanded2.attemptId, attemptEpoch: 2, trainingContentBinding: compact2.storedBinding },
      store,
    )
    expect(hydrated1.trainingContentBinding).toEqual(expanded1)
    expect(hydrated2.trainingContentBinding).toEqual(expanded2)
    expect(repo.append).toHaveBeenCalledTimes(1)

    // Reject compact reference when publicationHash disagrees with template
    const tamperedPubRef = { ...compact1.storedBinding, publicationHash: sha('wrong-pub') }
    const unexpandedTampered = await resolveTrainingContentBindingParent(
      undefined,
      { id: expanded1.attemptId, attemptEpoch: 1, trainingContentBinding: tamperedPubRef },
      store,
    )
    expect(unexpandedTampered.trainingContentBinding).toEqual(tamperedPubRef)

    // Validate downstream identity check passes & rejects tampering
    const validContent = trainingBoundContent({
      id: expanded1.attemptId,
      attemptEpoch: 1,
      compositeAssessmentId: compositeId,
      trainingContentBinding: hydrated1.trainingContentBinding,
      trainingContentBindingHash: compact1.bindingHash,
    })
    expect(validContent?.units).toHaveLength(1)
    expect(() => trainingBoundContent({
      id: expanded1.attemptId,
      attemptEpoch: 1,
      compositeAssessmentId: compositeId,
      trainingContentBinding: hydrated1.trainingContentBinding,
      trainingContentBindingHash: sha('tampered'),
    })).toThrow()

    // Sync resolver hits process-wide publicTemplates cache when populated
    const fakeHash = compact1.storedBinding.templateHash
    vi.spyOn(publicTemplates, 'get').mockReturnValueOnce({
      kind: 'TRAINING_CONTENT_BINDING_PLAN',
      value: { schemaVersion: 1, compositeId, publicationHash: pubHash, units: baseUnits },
      bytes: 128,
    })
    const syncHydrated = tryResolveTrainingContentBindingSync({
      id: expanded2.attemptId,
      attemptEpoch: 2,
      trainingContentBinding: { schemaVersion: 2, templateHash: fakeHash, publicationHash: pubHash },
    })
    expect(syncHydrated.trainingContentBinding).toEqual(expanded2)

    vi.spyOn(publicTemplates, 'get').mockReturnValueOnce({
      kind: 'TRAINING_CONTENT_BINDING_PLAN',
      value: { schemaVersion: 1, compositeId, publicationHash: pubHash, units: baseUnits },
      bytes: 128,
    })
    const syncMismatch = tryResolveTrainingContentBindingSync({
      id: expanded2.attemptId,
      attemptEpoch: 2,
      trainingContentBinding: { schemaVersion: 2, templateHash: fakeHash, publicationHash: sha('wrong-pub') },
    })
    expect(isCompactTrainingContentBindingRef(syncMismatch.trainingContentBinding)).toBe(true)
  })

  it('commits Scale-only WHOLE_V2 FINAL without checkpoint queries, skips duplicate replay check, and runs buildFeedback after finalizeGovernanceInTx', async () => {
    const fixture = buildFourFamilyTestSlots()
    const scaleSlot = fixture.slots.find(s => s.unitType === 'SCALE')!
    const compositeId = randomUUID()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId,
      title: 'Scale-only Convergence Plan',
      slots: [scaleSlot],
    })
    const scaleGold = fixture.scalePkg.goldenCases[0]
    const answers = scaleGold.answers.map(a => ({ itemCode: a.itemCode, responseValue: a.responseValue }))

    const { db, finals, executedSqls } = makeFinalDb(plan.publicationHash)
    const { store } = makeTemplateStore()
    const callOrder: string[] = []
    const fakeReceipt = { schemaVersion: 1, attemptId } as any
    const fakeReleases = new Map<string, any>()
    let receivedContext: any = null

    const out = await commitCompositeWholeFinal(db, {
      templates: store,
      attempt: {
        id: attemptId,
        compositeAssessmentId: compositeId,
        subjectUserId: 'user-1',
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        receiptOnly: false,
        startedAt: new Date(Date.now() - 5000),
        publicationHash: plan.publicationHash,
        unitSeedsEncrypted: null,
        deliveryCourseId: null,
        organizationId: 'org-1',
      },
      plan,
      draftCheckpointEnabled: false,
      submit: {
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        submissionId: randomUUID(),
        units: {
          [scaleSlot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: scaleSlot.definitionHash,
            answers,
          },
        },
      },
      finalizeGovernanceInTx: async () => {
        callOrder.push('finalizeGovernanceInTx')
        return {
          trainingContentInterpretationEncrypted: 'enc-interp',
          trainingContentInterpretationHash: sha('interp'),
          receipt: fakeReceipt,
          referenceBinding: null,
          releases: fakeReleases,
        }
      },
      buildFeedback: async (_facts, ctx) => {
        callOrder.push('buildFeedback')
        receivedContext = ctx
        return {
          schemaVersion: 1,
          kind: 'EDUCATION_FEEDBACK',
          ok: true,
          scaleCount: ctx?.scaleResults.size ?? 0,
        }
      },
    })

    expect(out.status).toBe('COMPLETED')
    expect(out.replayed).toBe(false)
    expect(callOrder).toEqual(['finalizeGovernanceInTx', 'buildFeedback'])
    expect(receivedContext?.scaleResults.get(scaleSlot.slotKey)).toBeDefined()
    expect(receivedContext?.envelopesBySlotKey.get(scaleSlot.slotKey)).toBeDefined()
    expect(receivedContext?.governance?.receipt).toBe(fakeReceipt)
    expect(receivedContext?.governance?.releases).toBe(fakeReleases)

    // Zero checkpoint SQL statements & only 1 pre-lock composite_attempt_finals lookup
    const checkpointSqls = executedSqls.filter(sql => sql.includes('composite_attempt_checkpoints'))
    const finalSelectSqls = executedSqls.filter(sql => sql.includes('FROM composite_attempt_finals'))
    expect(checkpointSqls).toHaveLength(0)
    expect(finalSelectSqls).toHaveLength(1)

    const saved = finals.get(`${attemptId}:1`)
    expect(decryptCompactField<any>(saved.feedbackCipher)).toEqual({
      schemaVersion: 1,
      kind: 'EDUCATION_FEEDBACK',
      ok: true,
      scaleCount: 1,
    })

    // With draftCheckpointEnabled omitted (default), checkpoint delete still runs for backwards compatibility
    const secondDb = makeFinalDb(plan.publicationHash)
    await commitCompositeWholeFinal(secondDb.db, {
      templates: store,
      attempt: {
        id: attemptId,
        compositeAssessmentId: compositeId,
        subjectUserId: 'user-1',
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        receiptOnly: true,
        startedAt: new Date(Date.now() - 5000),
        publicationHash: plan.publicationHash,
        unitSeedsEncrypted: null,
        deliveryCourseId: null,
      },
      plan,
      submit: {
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        submissionId: randomUUID(),
        units: {
          [scaleSlot.slotKey]: {
            unitType: 'SCALE',
            definitionHash: scaleSlot.definitionHash,
            answers,
          },
        },
      },
    })
    expect(secondDb.executedSqls.some(sql => sql.includes('DELETE FROM composite_attempt_checkpoints'))).toBe(true)
  })

  it('batch-prefetches MEASUREMENT + REPORT releases in prepareTrainingFinalReceipt on compact V2 parent', async () => {
    const ownerId = randomUUID()
    const compositeId = randomUUID()
    const attemptId = randomUUID()
    const scaleId = randomUUID()
    const mId = randomUUID()
    const rId = randomUUID()
    const defHash = sha('scale-def')
    const measContent = { metrics: [{ metricKey: 'total', label: '总分', unit: '分' }] }
    const measHash = canonicalHash(measContent)
    const templateRows = new Map<string, PublicTemplateRow>()
    const templateStore = createPublicTemplateStore({
      read: async hashes => hashes.flatMap(h => (templateRows.has(h) ? [templateRows.get(h)!] : [])),
      append: async rs => { for (const r of rs) templateRows.set(r.templateHash, r) },
    })

    const unit: TrainingContentAttemptBinding['units'][number] = {
      itemId: randomUUID(),
      family: 'SCALE',
      source: { kind: 'SCALE', id: scaleId, ownerId },
      measurement: { releaseId: mId, contentHash: '', measurementHash: measHash },
      report: { releaseId: rId, contentHash: '' },
    }
    const rContent = {
      generatorVersion: DECLARATIVE_REPORT_GENERATOR,
      metricKeys: ['total'],
      measurements: [{ releaseId: mId, contentHash: '' }],
      template: { blocks: [] },
    }
    const measContentHash = canonicalHash({ layer: 'MEASUREMENT', family: 'SCALE', content: measContent })
    rContent.measurements[0].contentHash = measContentHash
    const repContentHash = canonicalHash({ layer: 'REPORT', family: 'SCALE', content: rContent })
    unit.measurement.contentHash = measContentHash
    unit.report!.contentHash = repContentHash

    const expanded: TrainingContentAttemptBinding = {
      schemaVersion: 1,
      compositeId,
      attemptId,
      epoch: 1,
      publicationHash: sha('pub-snap'),
      units: [unit],
    }
    const compact = await saveCompactTrainingContentBinding(undefined, expanded, templateStore)
    const storedTemplateRow = [...templateRows.values()][0]

    const releaseMap = new Map<string, any>([
      [mId, {
        releaseId: mId, layer: 'MEASUREMENT', family: 'SCALE', status: 'PUBLISHED',
        contentHash: measContentHash, content: { ...measContent, measurementHash: measHash },
        scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId, resourceId: scaleId },
      }],
      [rId, {
        releaseId: rId, layer: 'REPORT', family: 'SCALE', status: 'PUBLISHED',
        contentHash: repContentHash, content: rContent,
        scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId, resourceId: compositeId },
      }],
    ])

    const prefetchSpy = vi.spyOn(measurementRepo, 'prefetchContentReleases').mockImplementation(async (_tx, cache, ids) => {
      for (const id of ids) {
        const rel = releaseMap.get(id)
        if (rel) cache.set(id, rel)
      }
      return cache as any
    })
    const getSpy = vi.spyOn(measurementRepo, 'getContentRelease')

    const mockTx: any = {
      $queryRaw: vi.fn(async (sql: any) => {
        const text = sqlTextOf(sql)
        if (text.includes('assessment_public_templates')) {
          return [storedTemplateRow]
        }
        if (text.includes('scale_library_entries') || text.includes('registered_assessment_resources')) {
          return [{ ok: true }]
        }
        return []
      }),
      scale: { findUnique: vi.fn(async () => ({ id: scaleId, createdBy: ownerId })) },
      compositeAssessment: { findUnique: vi.fn(async () => ({ id: compositeId, createdBy: ownerId })) },
    }

    const core = {
      schemaVersion: 1 as const,
      unitType: 'SCALE' as const,
      sourceDefinitionHash: defHash,
      compiledRuntimeHash: sha('runtime'),
      contextHash: null,
      quality: { status: 'interpretable' as const, reasonCodes: [] },
      metrics: [{ key: 'total', value: 12, unit: '分', quality: 'calculated' as const }],
    }
    const fakeEnvelope: any = {
      schemaVersion: 1,
      unitType: 'SCALE',
      resultHash: canonicalHash(core),
      core,
      completedAt: new Date().toISOString(),
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: attemptId, sourceSubmissionId: 'sub-1' },
    }
    const prepared = await prepareTrainingFinalReceipt(mockTx, {
      parent: {
        id: attemptId,
        attemptEpoch: 1,
        compositeAssessmentId: compositeId,
        trainingContentBinding: compact.storedBinding,
        trainingContentBindingHash: compact.bindingHash,
        compositeAssessment: { id: compositeId, createdBy: ownerId },
      },
      aggregateInputHash: sha('agg'),
      completedAt: new Date(),
      verifiedPayloads: [{ header: { slotKey: `SCALE:${unit.itemId}` }, envelope: fakeEnvelope }],
    })

    expect(prepared).not.toBeNull()
    expect(prefetchSpy).toHaveBeenCalledTimes(1)
    expect(prefetchSpy.mock.calls[0][2]).toEqual([mId, rId])
    expect(getSpy).not.toHaveBeenCalled()
    expect(prepared?.releases.has(mId)).toBe(true)
    expect(prepared?.releases.has(rId)).toBe(true)
  })

  it('verifies _v2Verify release revocation & hashes in readSchoolOrdinaryFeedback before returning cached EDUCATION_FEEDBACK', async () => {
    const execId = randomUUID()
    const parentId = randomUUID()
    const actorUserId = randomUUID()
    const relId = randomUUID()
    const policyHash = sha('policy')
    const manifestHash = sha('manifest')
    const blockVersionId = randomUUID()
    const toolId = randomUUID()

    const ownRow = {
      organizationId: randomUUID(),
      key: `education-composition:SCHOOL:${randomUUID()}:STUDENT:SELF:1.0.0`,
      version: '1.0.0',
      policy: {},
      policyHash,
      status: 'COMPLETED',
      subjectUserId: actorUserId,
      respondentUserId: actorUserId,
      subjectRole: 'STUDENT',
      respondentRole: 'STUDENT',
      relationshipKind: 'SELF',
      perspective: 'SELF_REPORT',
      receiptOnly: false,
      contentState: null,
      preMaterializedReport: null,
      parentId,
      parentStatus: 'COMPLETED',
      attemptEpoch: 1,
      publicationHash: sha('pub'),
      contextSnapshotHash: null,
      frozenSlots: null,
      frozenSlotsHash: null,
    }
    const fakeTx: any = {
      $executeRaw: vi.fn(async () => 0),
      $queryRaw: vi.fn(async () => [ownRow]),
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(fakeTx))
    vi.spyOn(compositionExec, 'readFrozenCompositionIdentity').mockResolvedValue({
      compositeId: randomUUID(),
      title: 'Test School Composition',
      origin: {
        schemaVersion: 1,
        adapterVersion: '1.0.0',
        mode: 'COMPOSITION',
        entry: 'SCHOOL',
        organizationId: ownRow.organizationId,
        ownerUserId: randomUUID(),
        toolId: randomUUID(),
        versionId: randomUUID(),
        contentHash: sha('ver'),
        variantKey: 'STUDENT:SELF',
      },
      binding: {
        schemaVersion: 1,
        origin: {} as any,
        manifestHash,
        unitReports: [{
          blockId: 'blk-1',
          versionId: blockVersionId,
          contentHash: sha('bver'),
          respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['m1'], longitudinalMetricKeys: [] },
        }],
      },
      policy: {} as any,
      policyHash,
      manifest: [{
        blockId: 'blk-1',
        instruction: '',
        kind: 'SCALE',
        versionId: blockVersionId,
        contentHash: sha('bver'),
        sourceProvider: 'STANDARD_SCALE',
        toolId,
        itemIds: ['item-1'],
        sectionIds: [],
        title: 'Standard Scale',
      }] as any,
      units: [{
        itemId: 'item-1',
        family: 'SCALE',
        versionId: blockVersionId,
        scaleId: randomUUID(),
        definitionHash: sha('def'),
        releaseId: relId,
        contentHash: sha('mc'),
        measurementHash: sha('mh'),
      }] as any,
    })

    // 1. Live release PUBLISHED + hashes match => returns stripped DTO without fallback
    const cachedFeedback = {
      schemaVersion: 1 as const,
      kind: 'EDUCATION_FEEDBACK' as const,
      mode: 'COMPOSITION' as const,
      state: 'READY' as const,
      title: 'Test School Composition',
      units: [{ blockId: 'blk-1', kind: 'SCALE', title: 'Standard Scale', state: 'READY' as const }],
      _v2Verify: { policyHash, manifestHash, releaseIds: [relId] },
    }
    vi.spyOn(compositeFinalBridge, 'tryReadCompositeFinalFeedback').mockResolvedValue(cachedFeedback)
    const batchSpy = vi.spyOn(measurementRepo, 'getContentReleaseBatch').mockResolvedValue(
      new Map([[relId, { releaseId: relId, status: 'PUBLISHED' } as any]]),
    )
    vi.spyOn(respondentSummaryMod, 'readRespondentRunSummary').mockResolvedValue({
      state: 'READY',
      mode: 'INDIVIDUAL_SUMMARY',
      metricKeys: ['m1'],
    } as any)
    const declaredSpy = vi.spyOn(declaredFeedbackMod, 'readOrdinaryDeclaredFeedback').mockResolvedValue(new Map())

    const resPublished = await readSchoolOrdinaryFeedback({ executionId: execId, actorUserId })
    expect(batchSpy).toHaveBeenCalledTimes(1)
    expect(batchSpy.mock.calls[0]?.[1]).toEqual([relId])
    expect(declaredSpy).not.toHaveBeenCalled()
    expect('_v2Verify' in resPublished).toBe(false)
    expect(resPublished.state).toBe('READY')

    // 2. Live release REVOKED => invalidates cached feedback and falls back to live declared reader
    batchSpy.mockResolvedValueOnce(new Map([[relId, { releaseId: relId, status: 'REVOKED' } as any]]))
    const resRevoked = await readSchoolOrdinaryFeedback({ executionId: execId, actorUserId })
    expect(declaredSpy).toHaveBeenCalledTimes(1)
    expect(resRevoked.units[0]?.state).toBe('WITHHELD')

    // 3. Stale policyHash => invalidates cached feedback without even querying live releases
    batchSpy.mockClear()
    declaredSpy.mockClear()
    vi.spyOn(compositeFinalBridge, 'tryReadCompositeFinalFeedback').mockResolvedValueOnce({
      ...cachedFeedback,
      _v2Verify: { policyHash: sha('stale-policy'), manifestHash, releaseIds: [relId] },
    })
    const resStalePolicy = await readSchoolOrdinaryFeedback({ executionId: execId, actorUserId })
    expect(batchSpy).not.toHaveBeenCalled()
    expect(declaredSpy).toHaveBeenCalledTimes(1)
    expect(resStalePolicy.units[0]?.state).toBe('WITHHELD')

    // 4. Pure native scale (releaseIds: []) => 0 release queries
    batchSpy.mockClear()
    declaredSpy.mockClear()
    vi.spyOn(compositeFinalBridge, 'tryReadCompositeFinalFeedback').mockResolvedValueOnce({
      ...cachedFeedback,
      _v2Verify: { policyHash, manifestHash, releaseIds: [] },
    })
    const resNative = await readSchoolOrdinaryFeedback({ executionId: execId, actorUserId })
    expect(batchSpy).not.toHaveBeenCalled()
    expect(declaredSpy).not.toHaveBeenCalled()
    expect('_v2Verify' in resNative).toBe(false)
  })

  it('uses the single-statement flat fast path for BOUND_FINAL in assertCurrentRunStartAuthority', async () => {
    const orgId = randomUUID()
    const runId = randomUUID()
    const trackId = randomUUID()
    const execId = randomUUID()
    const userId = randomUUID()
    const snapId = randomUUID()
    const knownEnvelope = {
      executionId: execId,
      organizationId: orgId,
      runId,
      trackId,
      executionStatus: 'STARTED',
      orgStatus: 'ACTIVE',
      orgProductDomain: 'SCHOOL',
      subjectActorSnapshotId: snapId,
      respondentActorSnapshotId: snapId,
      subjectUserId: userId,
      subjectRole: 'STUDENT',
      subjectProvenance: 'ORG_MEMBER',
      subjectMembershipId: randomUUID(),
      subjectPersonaGrantId: randomUUID(),
      respondentUserId: userId,
      respondentRole: 'STUDENT',
      respondentProvenance: 'ORG_MEMBER',
      respondentMembershipId: null,
      respondentPersonaGrantId: null,
      relationshipKind: 'SELF',
      relationshipRef: null,
      relationshipCourseId: null,
      relationshipStudentClassAssignmentId: null,
      relationshipStaffClassAssignmentId: null,
      relationshipClassUnitId: null,
      trackResourceFamily: 'BUNDLE',
      trackResourceKey: `education-composition:SCHOOL:${randomUUID()}:STUDENT:SELF:1.0.0`,
      trackResourceVersion: '1.0.0',
      intakeDeadline: new Date(Date.now() - 10_000),
      hasCampusActivity: true,
      hasHuiteacherLink: false,
    }

    // Allows BOUND_FINAL even when intakeOpen is false in 1 single query
    const txAllowed: any = {
      $queryRaw: vi.fn(async () => [{
        isLibrary: true,
        userValid: true,
        accountNotExpired: true,
        actorValid: true,
        actorDenied: false,
        populationCurrent: true,
        intakeOpen: false,
      }]),
    }
    await assertCurrentRunStartAuthority(txAllowed, execId, {
      accountMode: 'DETECT_EDUCATION_LIBRARY',
      operation: 'BOUND_FINAL',
      productScope: 'CAMPUS_ONLY',
      knownEnvelope,
    })
    expect(txAllowed.$queryRaw).toHaveBeenCalledTimes(1)

    // Rejects !fast.isLibrary with RUN_BOUND_FINAL_SOURCE_REQUIRED in 1 query
    const txRejected: any = {
      $queryRaw: vi.fn(async () => [{
        isLibrary: false,
        userValid: true,
        accountNotExpired: true,
        actorValid: true,
        actorDenied: false,
        populationCurrent: true,
        intakeOpen: true,
      }]),
    }
    await expect(assertCurrentRunStartAuthority(txRejected, execId, {
      accountMode: 'DETECT_EDUCATION_LIBRARY',
      operation: 'BOUND_FINAL',
      productScope: 'CAMPUS_ONLY',
      knownEnvelope,
    })).rejects.toThrow(/RUN_BOUND_FINAL_SOURCE_REQUIRED|current Run START authority/)
    expect(txRejected.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('enforces safe SQL trigger migration guards and converged prod-override compose quotas', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../prisma/migrations/20261124120000_compact_training_content_binding_v2/migration.sql',
    )
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')
    expect(migrationSql).toContain('assessment_public_templates_template_kind_check')
    expect(migrationSql).toContain("'TRAINING_CONTENT_BINDING_PLAN'")
    expect(migrationSql).toContain("schemaVersion'='2' AND NOT (NEW.training_content_binding ? 'units')")
    expect(migrationSql).toContain("schemaVersion'='2' AND NOT (a.training_content_binding ? 'units')")
    expect(migrationSql).toContain('NEW.training_variant_allocation_encrypted IS NOT NULL')
    expect(migrationSql).toContain('a.training_variant_allocation_encrypted IS NULL')
    expect(migrationSql).toContain("(NEW.training_content_binding->>'publicationHash') IS DISTINCT FROM publication.training_content_snapshot_hash")
    expect(migrationSql).toContain("jsonb_array_length(NEW.training_reference_binding->'units')<>jsonb_array_length(binding_units)")
    expect(migrationSql).toContain("t.template_kind='TRAINING_CONTENT_BINDING_PLAN'")
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION guard_training_content_attempt()')
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION guard_training_reference_binding()')
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION guard_training_interpretation_artifact()')

    const overridePath = path.resolve(__dirname, '../../../../docker-compose.prod-override.example.yml')
    const overrideYml = fs.readFileSync(overridePath, 'utf8')
    expect(overrideYml).toContain('COMPOSITE_WHOLE_V2_ENABLED: "true"')
    expect(overrideYml).toContain('PRISMA_CONNECTION_POOL_SIZE: "12"')
    expect(overrideYml).toContain('WHOLE_SUBMIT_ADMISSION_LIMIT: "9"')
    expect(overrideYml).not.toContain('WHOLE_SUBMIT_ADMISSION_LIMIT: "12"')
    expect(overrideYml).toContain('shared_buffers=256MB')
    expect(overrideYml).toContain('effective_cache_size=1024MB')
    expect(overrideYml).toContain('PRISMA_CONNECTION_POOL_SIZE: "3"')
    expect(overrideYml).toContain('PRISMA_CONNECTION_POOL_SIZE: "2"')
  })
})
