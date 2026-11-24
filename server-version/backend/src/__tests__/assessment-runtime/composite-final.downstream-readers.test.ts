import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from './phase2-test-fixtures'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import {
  buildCompositePublicationPlan,
  generateCompositeUnitSeeds,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { commitCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
import {
  compositeFinalUnitSyntheticId,
  extractCompositeFinalFormValues,
  parseCompositeFinalUnitSyntheticId,
  readCompositeFinalContextSnapshot,
  readCompositeFinalUnitForSafety,
  readCompositeFinalUnitSnapshots,
  tryReadCompositeFinalFeedback,
} from '../../modules/assessment-runtime/composite-final.bridge'
import { isCompositeWholeV2Enabled } from '../../modules/assessment-runtime/composite-whole-v2-flag'
import { assessmentContextHashMatches, decryptAssessmentContext } from '../../modules/assessment-context/security'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { scaleProjectionPolicyFromCompiled } from '../../modules/scale/projection/policy-resolver'
import { gonogoSequence } from '../../modules/cognitive/randomization'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => {
      for (const r of rs) rows.set(r.templateHash, r)
    }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

function makeInMemoryFinalDb(parentRow?: { status: string; attemptEpoch: number; publicationHash: string }) {
  const finals = new Map<string, any>()
  const finalsBySubmission = new Map<string, any>()
  const executedSqls: string[] = []

  const db: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
      if (text.includes('FROM composite_assessment_attempts')) {
        return parentRow ? [{ ...parentRow }] : []
      }
      if (text.includes('FROM composite_attempt_finals') && text.includes('submission_id =')) {
        const [attemptId, attemptEpoch, submissionId] = sql.values
        const row = finals.get(`${attemptId}:${attemptEpoch}`) ?? finalsBySubmission.get(submissionId)
        return row ? [row] : []
      }
      if (text.includes('FROM composite_attempt_finals')) {
        if (text.includes('WHERE attempt_id =')) {
          const [attemptId, attemptEpoch] = sql.values
          const row = finals.get(`${attemptId}:${attemptEpoch}`)
          return row ? [row] : []
        }
        if (text.includes('IN (')) {
          return [...finals.values()]
        }
      }
      return []
    }),
    $executeRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
      if (text.includes('INSERT INTO composite_attempt_finals')) {
        const [
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          publicationHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        ] = sql.values
        const row = {
          attemptId, attemptEpoch, compositeId, organizationId, courseId,
          publicationHash, slotSetHash, contextHash, submissionId,
          payloadHash, aggregateHash, factsHash, factsCipher,
          rawHash, rawCipher, feedbackCipher, completedAt,
        }
        finals.set(`${attemptId}:${attemptEpoch}`, row)
        finalsBySubmission.set(submissionId, row)
        return 1
      }
      return 1
    }),
    // Legacy child-table accessors intentionally throw if ever touched on WHOLE_V2 reads
    assessmentUnitSnapshot: {
      findMany: vi.fn(() => { throw new Error('Legacy assessment_unit_snapshots must NOT be queried for WHOLE_V2') }),
    },
    assessment: {
      findMany: vi.fn(() => { throw new Error('Legacy assessments must NOT be queried for WHOLE_V2') }),
    },
    cognitiveSession: {
      findMany: vi.fn(() => { throw new Error('Legacy cognitive_sessions must NOT be queried for WHOLE_V2') }),
    },
    situationalAttempt: {
      findMany: vi.fn(() => { throw new Error('Legacy situational_attempts must NOT be queried for WHOLE_V2') }),
    },
    compositeFormAnswer: {
      findMany: vi.fn(() => { throw new Error('Legacy composite_form_answers must NOT be queried for WHOLE_V2') }),
    },
  }
  return { db, finals, executedSqls }
}

function makeGonogoTrials(randomSeed: string, count = 8) {
  const sequence = gonogoSequence(randomSeed, count, 0.25)
  return sequence.map((trialType, idx) => {
    const isNogo = trialType === 'nogo'
    return {
      schemaVersion: 1,
      trialIndex: idx,
      phase: 'test',
      startedAtPerfMs: idx * 1300,
      endedAtPerfMs: idx * 1300 + 360,
      durationMs: 360,
      flags: { timeout: false, premature: false },
      qualityEvents: [],
      payload: {
        trialType,
        responded: !isNogo,
        rtMs: isNogo ? null : 350 + idx * 5,
        interrupted: false,
      },
    }
  })
}

describe('Phase 2 PR 4 downstream readers bridge (zero legacy child-table reads)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('respects COMPOSITE_WHOLE_V2_ENABLED feature flag cleanly', () => {
    vi.stubEnv('COMPOSITE_WHOLE_V2_ENABLED', 'false')
    expect(isCompositeWholeV2Enabled()).toBe(false)
    vi.stubEnv('COMPOSITE_WHOLE_V2_ENABLED', 'true')
    expect(isCompositeWholeV2Enabled()).toBe(true)
  })

  it('roundtrips synthetic unit IDs for safety / longitudinal references', () => {
    const id = compositeFinalUnitSyntheticId('attempt-123', 2, 'scale:item-9')
    expect(id).toBe('final:attempt-123:2:scale:item-9')
    expect(parseCompositeFinalUnitSyntheticId(id)).toEqual({
      attemptId: 'attempt-123',
      attemptEpoch: 2,
      slotKey: 'scale:item-9',
    })
    expect(parseCompositeFinalUnitSyntheticId('legacy-uuid-1234')).toBeNull()
  })

  it('projects all 4 families, context, feedback, and safety units from composite_attempt_finals with 0 legacy reads', async () => {
    const { store } = makeTemplateStore()
    const fixture = buildFourFamilyTestSlots()
    const compositeId = randomUUID()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId,
      title: '四合一压测混合卷',
      slots: fixture.slots,
    })
    const { db, executedSqls } = makeInMemoryFinalDb({
      status: 'IN_PROGRESS',
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
    })
    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const cogSlotKey = `cognitive:${fixture.cogItemId}`
    const scaleSlotKey = `scale:${fixture.scaleItemId}`
    const sjtSlotKey = `situational:${fixture.sjtItemId}`
    const formSlotKey = `form:${fixture.formSectionId}`

    const scaleGold = fixture.scalePkg.goldenCases.find(c => c.expected.quality)!
    const sjtGold = fixture.sjtPkg.goldenCases[0]
    const sjtResponses = Object.fromEntries(
      sjtGold.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]),
    )

    const feedbackPayload = {
      schemaVersion: 1 as const,
      kind: 'EDUCATION_FEEDBACK' as const,
      mode: 'COMPOSITION' as const,
      state: 'READY' as const,
      title: '四合一压测混合卷',
      units: [{ blockId: 'b-1', kind: 'SCALE', title: '测试量表', state: 'READY' as const }],
    }

    const receipt = await commitCompositeWholeFinal(db, {
      attempt: {
        id: attemptId,
        compositeAssessmentId: compositeId,
        organizationId: randomUUID(),
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        unitSeedsEncrypted: seeds.encrypted,
        receiptOnly: false,
        startedAt: new Date('2026-11-24T01:00:00.000Z'),
      },
      plan,
      submit: {
        submissionId: `whole-${sha('downstream-readers-test')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        totalTimeMs: 42_000,
        units: {
          [formSlotKey]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '8' }],
          },
          [scaleSlotKey]: {
            unitType: 'SCALE',
            definitionHash: fixture.scaleDefHash,
            answers: scaleGold.answers,
          },
          [sjtSlotKey]: {
            unitType: 'SITUATIONAL',
            definitionHash: fixture.sjtDefHash,
            responses: sjtResponses,
            totalTimeMs: 9500,
          },
          [cogSlotKey]: {
            unitType: 'COGNITIVE',
            definitionHash: fixture.cogDefHash,
            randomSeed: seeds.seeds[cogSlotKey],
            trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
          },
        },
      },
      templates: store,
      buildFeedback: async () => feedbackPayload,
      now: new Date('2026-11-24T01:00:42.000Z'),
    })

    expect(receipt.status).toBe('COMPLETED')
    expect(receipt.replayed).toBe(false)
    executedSqls.length = 0

    // 1. Hot batch snapshot reader (used by group reports, cohort materializers,
    //    exports, longitudinal tracking, reinterpretation, and disclosure checks)
    const unitRead = await readCompositeFinalUnitSnapshots(
      db,
      [{ attemptId, attemptEpoch: 1 }],
      { templates: store },
    )
    expect(unitRead.loadedFactsByKey.size).toBe(1)
    expect(unitRead.snapshots).toHaveLength(4)

    const scaleView = unitRead.snapshots.find(s => s.unitType === 'SCALE')!
    expect(scaleView.scaleResult).toBeDefined()
    expect(scaleView.scaleResult!.scores.length).toBeGreaterThan(0)
    expect(scaleView.canonicalEnvelope?.core.unitType).toBe('SCALE')
    expect(scaleView.canonicalEnvelope?.core.metrics.length).toBeGreaterThan(0)

    const sjtView = unitRead.snapshots.find(s => s.unitType === 'SITUATIONAL')!
    expect(sjtView.canonicalEnvelope?.core.unitType).toBe('SITUATIONAL')
    expect(sjtView.canonicalEnvelope?.core.metrics.length).toBeGreaterThan(0)

    const cogView = unitRead.snapshots.find(s => s.unitType === 'COGNITIVE')!
    expect(cogView.canonicalEnvelope?.core.unitType).toBe('COGNITIVE')
    expect(cogView.canonicalEnvelope?.core.metrics.length).toBeGreaterThan(0)

    const formView = unitRead.snapshots.find(s => s.unitType === 'FORM_SECTION')!
    expect(formView.unitFact.unitType).toBe('FORM_SECTION')
    expect(formView.payloadKind).toBe('COLLECTION_FACTS')
    expect(formView.sourceType).toBe('COMPOSITE_FORM_SECTION')
    if (formView.unitFact.unitType === 'FORM_SECTION') {
      expect(formView.unitFact.typedValues[fixture.formItemId]).toBe('8')
    }

    // 1B. Scale compiledRuntimeHash remains real (not bundleHash) even when hydrateScaleCanonical is false (P1-14)
    const lightRead = await readCompositeFinalUnitSnapshots(
      db,
      [{ attemptId, attemptEpoch: 1 }],
      { unitTypes: ['SCALE'], hydrateScaleCanonical: false, templates: store },
    )
    const lightScale = lightRead.snapshots[0]!
    expect(lightScale.compiledRuntimeHash).toBe(scaleView.canonicalEnvelope!.core.compiledRuntimeHash)
    if (lightScale.unitFact.unitType === 'SCALE') {
      expect(lightScale.compiledRuntimeHash).not.toBe(lightScale.unitFact.bundleHash)
    }

    // 2. Context snapshot reader
    const ctx = await readCompositeFinalContextSnapshot(db, attemptId, 1)
    expect(ctx).not.toBeNull()
    expect(ctx!.values).toEqual({ gradeLevel: '8' })
    expect(ctx!.contextHash).toMatch(/^[a-f0-9]{64}$/)

    // 3. Longitudinal typed form extraction
    const loadedFacts = unitRead.loadedFactsByKey.get(`${attemptId}:1`)!
    expect(extractCompositeFinalFormValues(loadedFacts.facts)).toEqual({
      [fixture.formItemId]: '8',
    })

    // 4. Single-PK pre-materialized feedback fast path
    const fb = await tryReadCompositeFinalFeedback<typeof feedbackPayload>(db, attemptId, 1)
    expect(fb).toEqual(feedbackPayload)

    // 5. Safety case unit lookup by synthetic ID
    const safetyLookup = await readCompositeFinalUnitForSafety(scaleView.id, db, store)
    expect(safetyLookup).not.toBeNull()
    expect(safetyLookup!.attemptId).toBe(attemptId)
    expect(safetyLookup!.slotKey).toBe(scaleSlotKey)
    expect(safetyLookup!.unit.scaleResult?.scores.length).toBeGreaterThan(0)

    // 6. Verify ZERO hot reads touched raw_cipher or any legacy child table!
    expect(executedSqls.length).toBeGreaterThan(0)
    for (const sql of executedSqls) {
      expect(sql).toContain('composite_attempt_finals')
      expect(sql).not.toContain('raw_cipher')
      expect(sql).not.toContain('assessment_unit_snapshots')
      expect(sql).not.toContain('assessment_result_facts')
    }
    expect(db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
    expect(db.assessment.findMany).not.toHaveBeenCalled()
    expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
    expect(db.situationalAttempt.findMany).not.toHaveBeenCalled()
    expect(db.compositeFormAnswer.findMany).not.toHaveBeenCalled()
  })

  it('fails loud on DB errors in readCompositeFinalUnitSnapshots instead of swallowing exceptions (P1-13)', async () => {
    const brokenDb = {
      $queryRaw: vi.fn(async () => {
        throw new Error('PG_CONNECTION_LOST')
      }),
    }
    await expect(
      readCompositeFinalUnitSnapshots(brokenDb, [{ attemptId: randomUUID(), attemptEpoch: 1 }]),
    ).rejects.toThrow('PG_CONNECTION_LOST')
  })

  it('persists verified AssessmentContextV1 + invokes finalizeGovernanceInTx with canonical 4-family envelopes in single parent UPDATE (P1-02 & P1-03)', async () => {
    const { store } = makeTemplateStore()
    const fixture = buildFourFamilyTestSlots()
    const compositeId = randomUUID()
    const attemptId = randomUUID()
    const subjectUserId = randomUUID()

    // Attach a real compiled Scale V2 disclosure policy to the Scale publication slot (P1-03)
    const scaleSource = getScaleInstrumentSource(fixture.scalePkg.key, fixture.scalePkg.instrumentVersion)
    const compiledPolicy = scaleSource ? compileScalePolicy(scaleSource) : undefined
    const slots = fixture.slots.map(slot => (
      slot.unitType === 'SCALE' && compiledPolicy
        ? { ...slot, instrumentClass: 'STANDARD' as const, compiledPolicy, runtimePolicyHash: compiledPolicy.runtimePolicyHash }
        : slot
    ))
    const plan = buildCompositePublicationPlan({
      compositeId,
      title: '治理闭环与V2策略测试卷',
      slots,
    })
    const scaleSlot = plan.slots.find(s => s.unitType === 'SCALE')!
    if (compiledPolicy && scaleSlot.unitType === 'SCALE') {
      expect(scaleSlot.compiledPolicy?.runtimePolicyHash).toBe(compiledPolicy.runtimePolicyHash)
      expect(scaleProjectionPolicyFromCompiled(scaleSlot.compiledPolicy!).disposition).toBe('FROZEN_V2')
    }

    const parentUpdateValues: unknown[][] = []
    const { db } = makeInMemoryFinalDb({
      status: 'IN_PROGRESS',
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
    })
    const origExecute = db.$executeRaw
    db.$executeRaw = vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('UPDATE composite_assessment_attempts')) {
        parentUpdateValues.push([...sql.values])
      }
      return origExecute(sql)
    })

    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const cogSlotKey = `cognitive:${fixture.cogItemId}`
    const scaleSlotKey = `scale:${fixture.scaleItemId}`
    const sjtSlotKey = `situational:${fixture.sjtItemId}`
    const formSlotKey = `form:${fixture.formSectionId}`
    const scaleGold = fixture.scalePkg.goldenCases.find(c => c.expected.quality)!
    const sjtGold = fixture.sjtPkg.goldenCases[0]
    const sjtResponses = Object.fromEntries(
      sjtGold.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]),
    )

    const fakeRefBinding = { schemaVersion: 1, attemptId, epoch: 1, units: [] }
    const fakeRefHash = sha('ref-binding')
    const fakeInterpCipher = 'enc:interp-receipt'
    const fakeInterpHash = sha('interp-receipt')
    let capturedGovernanceInfo: any = null

    const receipt = await commitCompositeWholeFinal(db, {
      attempt: {
        id: attemptId,
        compositeAssessmentId: compositeId,
        subjectUserId,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        unitSeedsEncrypted: seeds.encrypted,
        receiptOnly: false,
        startedAt: new Date('2026-11-24T01:00:00.000Z'),
      },
      plan,
      submit: {
        submissionId: `whole-${sha('governance-receipt-test')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        totalTimeMs: 30_000,
        units: {
          [formSlotKey]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '8' }],
          },
          [scaleSlotKey]: {
            unitType: 'SCALE',
            definitionHash: fixture.scaleDefHash,
            answers: scaleGold.answers,
          },
          [sjtSlotKey]: {
            unitType: 'SITUATIONAL',
            definitionHash: fixture.sjtDefHash,
            responses: sjtResponses,
            totalTimeMs: 9500,
          },
          [cogSlotKey]: {
            unitType: 'COGNITIVE',
            definitionHash: fixture.cogDefHash,
            randomSeed: seeds.seeds[cogSlotKey],
            trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
          },
        },
      },
      templates: store,
      finalizeGovernanceInTx: async (_tx, info) => {
        capturedGovernanceInfo = info
        return {
          trainingReferenceBinding: fakeRefBinding,
          trainingReferenceBindingHash: fakeRefHash,
          trainingContentInterpretationEncrypted: fakeInterpCipher,
          trainingContentInterpretationHash: fakeInterpHash,
        }
      },
      now: new Date('2026-11-24T01:00:30.000Z'),
    })

    expect(receipt.status).toBe('COMPLETED')
    expect(capturedGovernanceInfo).not.toBeNull()
    expect(capturedGovernanceInfo.contextObj).not.toBeNull()
    expect(capturedGovernanceInfo.contextObj.values).toEqual({ gradeLevel: '8' })
    expect(capturedGovernanceInfo.contextObj.subjectUserId).toBe(subjectUserId)
    expect(capturedGovernanceInfo.contextSnapshotEncrypted).toBeTruthy()
    // Verify assessmentContextHashMatches matches decrypted contextSnapshotEncrypted (P1-02)
    const decryptedCtx = decryptAssessmentContext(capturedGovernanceInfo.contextSnapshotEncrypted)
    expect(assessmentContextHashMatches(decryptedCtx, capturedGovernanceInfo.contextHash)).toBe(true)

    // Verify canonical envelopes were supplied for Scale, Situational, and Cognitive matching readCompositeFinalUnitSnapshots
    expect(capturedGovernanceInfo.verifiedPayloads).toHaveLength(3)
    const unitRead = await readCompositeFinalUnitSnapshots(db, [{ attemptId, attemptEpoch: 1 }], { templates: store })
    for (const payload of capturedGovernanceInfo.verifiedPayloads) {
      const snap = unitRead.snapshots.find(s => s.slotKey === payload.header.slotKey)!
      expect(snap).toBeDefined()
      expect(snap.canonicalEnvelope?.resultHash).toBe(payload.envelope.resultHash)
    }

    // Verify the single parent UPDATE persisted context + reference binding + interpretation receipt atomically
    expect(parentUpdateValues).toHaveLength(1)
    expect(parentUpdateValues[0]).toContain(capturedGovernanceInfo.contextSnapshotEncrypted)
    expect(parentUpdateValues[0]).toContain(capturedGovernanceInfo.contextHash)
    expect(parentUpdateValues[0]).toContain(JSON.stringify(fakeRefBinding))
    expect(parentUpdateValues[0]).toContain(fakeRefHash)
    expect(parentUpdateValues[0]).toContain(fakeInterpCipher)
    expect(parentUpdateValues[0]).toContain(fakeInterpHash)
  })
})
