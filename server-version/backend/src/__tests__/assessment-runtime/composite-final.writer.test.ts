import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from './phase2-test-fixtures'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import {
  buildCompositePublicationPlan,
  generateCompositeUnitSeeds,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { saveCompositeCheckpoint } from '../../modules/assessment-runtime/composite-checkpoint.service'
import { commitCompositeWholeFinal, prepareCompositeWholeFinal, type CommitCompositeWholeFinalInput } from '../../modules/assessment-runtime/composite-final.writer'
import {
  hydrateCompositeScaleUnitsBatch,
  readCompositeFinalFacts,
  readCompositeFinalFeedback,
  readCompositeFinalRawBatch,
} from '../../modules/assessment-runtime/composite-final.reader'
import { gonogoSequence } from '../../modules/cognitive/randomization'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

/** In-memory fake DB tracking EVERY SQL statement to guarantee 0 legacy child-table writes. */
function makeSingleRowFinalTxDb(initialParent?: { status: string; attemptEpoch: number; publicationHash: string | null }) {
  const finals = new Map<string, any>()
  const finalsBySubmission = new Map<string, any>()
  const checkpoints = new Map<string, any>()
  const attemptUpdates: any[] = []
  const executionUpdates: string[] = []
  const assignmentUpdates: string[] = []
  const executedSqls: string[] = []
  const parentState = {
    status: initialParent?.status ?? 'IN_PROGRESS',
    attemptEpoch: initialParent?.attemptEpoch ?? 1,
    publicationHash: initialParent?.publicationHash ?? null as string | null,
  }
  const runStatus = { execution: 'STARTED', assignment: 'STARTED' }

  const db: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
      if (text.includes('FROM composite_assessment_attempts')) {
        return [{ ...parentState }]
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
      if (text.includes('FROM composite_attempt_checkpoints')) {
        const attemptId = sql.values[0]
        const row = checkpoints.get(attemptId)
        return row ? [{ ...row, lockedSlotKeys: [...row.lockedSlotKeys] }] : []
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
      if (text.includes('UPDATE composite_assessment_attempts')) {
        if (parentState.status !== 'IN_PROGRESS') return 0
        parentState.status = 'COMPLETED'
        attemptUpdates.push(sql.values)
        return 1
      }
      if (text.includes('UPDATE assessment_run_executions')) {
        if (!['ASSIGNED', 'STARTED'].includes(runStatus.execution)) return 0
        runStatus.execution = 'COMPLETED'
        executionUpdates.push(sql.values[2])
        return 1
      }
      if (text.includes('UPDATE relational_assessment_assignments')) {
        if (!['OPEN', 'STARTED'].includes(runStatus.assignment)) return 0
        runStatus.assignment = 'COMPLETED'
        assignmentUpdates.push(sql.values[2])
        return 1
      }
      if (text.includes('INSERT INTO composite_attempt_checkpoints')) {
        const [attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt] = sql.values
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('UPDATE composite_attempt_checkpoints')) {
        const [attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt, attemptId] = sql.values
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('DELETE FROM composite_attempt_checkpoints')) {
        checkpoints.delete(sql.values[0])
        return 1
      }
      return 0
    }),
  }
  return { db, finals, checkpoints, attemptUpdates, executionUpdates, assignmentUpdates, executedSqls, parentState, runStatus }
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

describe('composite-final.writer (synchronous 1-tx 4-in-1 single-row FINAL)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('commits Form + Scale + SJT + Cognitive atomically in 1 row with 0 child writes and full reader roundtrip', async () => {
    const { store } = makeTemplateStore()
    const { db, finals, checkpoints, attemptUpdates, executionUpdates, assignmentUpdates, executedSqls, parentState } = makeSingleRowFinalTxDb()
    const fixture = buildFourFamilyTestSlots()
    const compositeId = randomUUID()
    const attemptId = randomUUID()
    const executionId = randomUUID()
    const assignmentId = randomUUID()
    const orgId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId,
      title: '四合一压测混合卷',
      slots: fixture.slots,
    })
    parentState.publicationHash = plan.publicationHash
    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const cogSlotKey = `cognitive:${fixture.cogItemId}`
    const cogTrials = makeGonogoTrials(seeds.seeds[cogSlotKey], 8)

    // Pre-lock the Cognitive unit in checkpoint (as frontend does on Cognitive completion)
    await saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      expectedRevision: 0,
      drafts: { [`scale:${fixture.scaleItemId}`]: { q1: 1 } },
      lockUnit: {
        slotKey: cogSlotKey,
        unit: {
          unitType: 'COGNITIVE',
          itemId: fixture.cogItemId,
          randomSeed: seeds.seeds[cogSlotKey],
          trials: cogTrials,
        },
      },
    })
    expect(checkpoints.size).toBe(1)

    const scaleGold = fixture.scalePkg.goldenCases.find(c => c.expected.quality)!
    const sjtGold = fixture.sjtPkg.goldenCases[0]
    const sjtResponses = Object.fromEntries(
      sjtGold.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]),
    )
    const submissionId = `whole-${sha('sub-4in1')}`
    const submitPayload = {
      submissionId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      slotSetHash: plan.slotSetHash,
      totalTimeMs: 95_000,
      units: {
        [`form:${fixture.formSectionId}`]: {
          unitType: 'FORM_SECTION' as const,
          definitionHash: fixture.formDefHash,
          answers: [{ formItemId: fixture.formItemId, value: '8' }],
        },
        [`scale:${fixture.scaleItemId}`]: {
          unitType: 'SCALE' as const,
          definitionHash: fixture.scaleDefHash,
          answers: scaleGold.answers.map((a, idx) => ({
            ...a,
            responseTimeMs: 400 + idx * 25,
            changeCount: idx === 0 ? 1 : 0,
          })),
        },
        [`situational:${fixture.sjtItemId}`]: {
          unitType: 'SITUATIONAL' as const,
          definitionHash: fixture.sjtDefHash,
          responses: sjtResponses,
        },
        // Omit locked Cognitive unit — writer must merge authoritative locked payload from checkpoint!
      },
    }

    const attempt = {
      id: attemptId,
      compositeAssessmentId: compositeId,
      organizationId: orgId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      unitSeedsEncrypted: seeds.encrypted,
      receiptOnly: false,
      startedAt: new Date('2026-11-24T01:00:00.000Z'),
    }

    const mixedInput: CommitCompositeWholeFinalInput = {
      attempt: {...attempt,status:'IN_PROGRESS'},
      plan,
      submit: submitPayload,
      templates: store,
      educationRun: { executionId, assignmentId },
      buildFeedback: async facts => ({
        headline: '四合一反馈完成',
        unitCount: Object.keys(facts.units).length,
      }),
      now: new Date('2026-11-24T01:01:35.000Z'),
    }
    Object.assign(parentState, {compositeAssessmentId:compositeId,receiptOnly:false,startedAt:attempt.startedAt})
    const prepared = await prepareCompositeWholeFinal(mixedInput, db)
    expect(prepared).toBeDefined()
    const receipt = await commitCompositeWholeFinal(db, mixedInput, prepared)

    expect(receipt.status).toBe('COMPLETED')
    expect(receipt.replayed).toBe(false)
    expect(receipt.feedbackAvailable).toBe(true)

    // Verify 1 single FINAL row, checkpoint deleted, attempt & educationRun updated, and ZERO legacy child-table writes
    expect(finals.size).toBe(1)
    expect(checkpoints.size).toBe(0)
    expect(attemptUpdates).toHaveLength(1)
    expect(executionUpdates).toEqual([executionId])
    expect(assignmentUpdates).toEqual([assignmentId])
    for (const forbidden of [
      'INSERT INTO assessments',
      'INSERT INTO assessment_result_facts',
      'INSERT INTO assessment_unit_snapshots',
      'INSERT INTO cognitive_sessions',
      'INSERT INTO situational_attempts',
      'INSERT INTO composite_form_answers',
    ]) {
      expect(executedSqls.some(s => s.includes(forbidden))).toBe(false)
    }

    // Verify CompositeFinalReader hot/cold/feedback roundtrip
    const loadedFacts = await readCompositeFinalFacts(db, { attemptId, attemptEpoch: 1 })
    expect(loadedFacts).not.toBeNull()
    const facts = loadedFacts!.facts
    expect(facts.contextHash).toMatch(/^[a-f0-9]{64}$/)
    expect(facts.executedSlotKeys).toHaveLength(4)

    const formFact = facts.units[`form:${fixture.formSectionId}`]
    expect(formFact.unitType).toBe('FORM_SECTION')
    if (formFact.unitType === 'FORM_SECTION') {
      expect(formFact.contextSnapshot).toEqual({ gradeLevel: '8' })
    }

    const scaleSlotKey = `scale:${fixture.scaleItemId}`
    const scaleFact = facts.units[scaleSlotKey]
    expect(scaleFact.unitType).toBe('SCALE')
    const hydratedMap = await hydrateCompositeScaleUnitsBatch([loadedFacts!], { templates: store })
    const hydratedScale = hydratedMap.get(`${attemptId}:1`)?.get(scaleSlotKey)
    expect(hydratedScale?.result.method.assessmentContext?.snapshotHash).toBe(facts.contextHash)
    expect(hydratedScale?.result.scores.length).toBeGreaterThan(0)

    const sjtFact = facts.units[`situational:${fixture.sjtItemId}`]
    expect(sjtFact.unitType).toBe('SITUATIONAL')
    if (sjtFact.unitType === 'SITUATIONAL') {
      expect(Object.keys(sjtFact.scores).length).toBeGreaterThan(0)
    }

    const cogFact = facts.units[cogSlotKey]
    expect(cogFact.unitType).toBe('COGNITIVE')
    if (cogFact.unitType === 'COGNITIVE') {
      expect(cogFact.trialCount).toBe(8)
      expect(cogFact.testType).toBe('gonogo')
      expect(Object.keys(cogFact.metrics).length).toBeGreaterThan(0)
      expect(Object.keys(cogFact.reportSummary).length).toBeGreaterThan(0)
      expect(cogFact.reportSummary.title).toBeTruthy()
    }

    const rawMap = await readCompositeFinalRawBatch(db, [{ attemptId, attemptEpoch: 1 }])
    const raw = rawMap.get(`${attemptId}:1`)!.raw
    expect(Object.keys(raw.units)).toHaveLength(4)
    const scaleRaw = raw.units[`scale:${fixture.scaleItemId}`]
    expect(scaleRaw.unitType).toBe('SCALE')
    if (scaleRaw.unitType === 'SCALE') {
      expect(scaleRaw.timings).toBeDefined()
    }
    // Full hydration with per-answer responseTimeMs + changeCount must match sourceResultHash!
    const fullHydrated = await hydrateCompositeScaleUnitsBatch([loadedFacts!], {
      rawByKey: rawMap,
      full: true,
      templates: store,
    })
    expect(fullHydrated.get(`${attemptId}:1`)?.get(`scale:${fixture.scaleItemId}`)?.result.scores.length).toBeGreaterThan(0)

    const feedbackRow = await readCompositeFinalFeedback(db, { attemptId, attemptEpoch: 1 })
    expect(feedbackRow?.feedback).toEqual({ headline: '四合一反馈完成', unitCount: 4 })

    // Idempotent replay with identical payload returns replayed=true
    const replayed = await commitCompositeWholeFinal(db, {
      attempt,
      plan,
      submit: submitPayload,
      templates: store,
    })
    expect(replayed.replayed).toBe(true)
    expect(replayed.aggregateHash).toBe(receipt.aggregateHash)

    // Mutated answer payload with same submissionId is rejected 409 SUBMISSION_PAYLOAD_CONFLICT
    await expect(commitCompositeWholeFinal(db, {
      attempt,
      plan,
      submit: {
        ...submitPayload,
        units: {
          ...submitPayload.units,
          [`form:${fixture.formSectionId}`]: {
            unitType: 'FORM_SECTION' as const,
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '9' }],
          },
        },
      },
      templates: store,
    })).rejects.toMatchObject({ statusCode: 409, code: 'SUBMISSION_PAYLOAD_CONFLICT' })
  })

  it('rejects tampered locked Cognitive trials (409), wrong randomSeed (409), non-IN_PROGRESS parent (409), and missing required units (400)', async () => {
    const { store } = makeTemplateStore()
    const { db, parentState } = makeSingleRowFinalTxDb()
    const fixture = buildFourFamilyTestSlots()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '防篡改校验卷',
      slots: fixture.slots,
    })
    parentState.publicationHash = plan.publicationHash
    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const cogSlotKey = `cognitive:${fixture.cogItemId}`
    const cogTrials = makeGonogoTrials(seeds.seeds[cogSlotKey], 8)
    const attempt = {
      id: attemptId,
      compositeAssessmentId: plan.compositeId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      unitSeedsEncrypted: seeds.encrypted,
      receiptOnly: true,
      startedAt: new Date(),
    }

    // 1. Missing required units -> 400 MISSING_REQUIRED_UNITS
    await expect(commitCompositeWholeFinal(db, {
      attempt,
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('missing')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [`form:${fixture.formSectionId}`]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '7' }],
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_REQUIRED_UNITS' })

    // 2. Wrong randomSeed -> 409 COGNITIVE_SEED_MISMATCH
    const scaleGold = fixture.scalePkg.goldenCases.find(c => c.expected.quality)!
    const sjtGold = fixture.sjtPkg.goldenCases[0]
    const sjtResponses = Object.fromEntries(sjtGold.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]))
    await expect(commitCompositeWholeFinal(db, {
      attempt,
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('bad-seed')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [`form:${fixture.formSectionId}`]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '7' }],
          },
          [`scale:${fixture.scaleItemId}`]: {
            unitType: 'SCALE',
            definitionHash: fixture.scaleDefHash,
            answers: scaleGold.answers,
          },
          [`situational:${fixture.sjtItemId}`]: {
            unitType: 'SITUATIONAL',
            definitionHash: fixture.sjtDefHash,
            responses: sjtResponses,
          },
          [cogSlotKey]: {
            unitType: 'COGNITIVE',
            definitionHash: fixture.cogDefHash,
            randomSeed: 'forged-seed-value',
            trials: cogTrials,
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 409, code: 'COGNITIVE_SEED_MISMATCH' })

    // 3. Locked Cognitive unit tampered in submit payload -> 409 CHECKPOINT_LOCKED_UNIT_IMMUTABLE
    await saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: plan.publicationHash,
      expectedRevision: 0,
      drafts: {},
      lockUnit: {
        slotKey: cogSlotKey,
        unit: {
          unitType: 'COGNITIVE',
          itemId: fixture.cogItemId,
          randomSeed: seeds.seeds[cogSlotKey],
          trials: cogTrials,
        },
      },
    })
    const tamperedTrials = cogTrials.map((t, i) => (i === 0 ? { ...t, durationMs: 111 } : t))
    await expect(commitCompositeWholeFinal(db, {
      attempt,
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('tampered-lock')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [`form:${fixture.formSectionId}`]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '7' }],
          },
          [`scale:${fixture.scaleItemId}`]: {
            unitType: 'SCALE',
            definitionHash: fixture.scaleDefHash,
            answers: scaleGold.answers,
          },
          [`situational:${fixture.sjtItemId}`]: {
            unitType: 'SITUATIONAL',
            definitionHash: fixture.sjtDefHash,
            responses: sjtResponses,
          },
          [cogSlotKey]: {
            unitType: 'COGNITIVE',
            definitionHash: fixture.cogDefHash,
            randomSeed: seeds.seeds[cogSlotKey],
            trials: tamperedTrials,
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 409, code: 'CHECKPOINT_LOCKED_UNIT_IMMUTABLE' })

    // 4. Non-IN_PROGRESS parent attempt (e.g. ABANDONED) is rejected inside transaction (409 STALE_ATTEMPT)
    parentState.status = 'ABANDONED'
    await expect(commitCompositeWholeFinal(db, {
      attempt,
      plan,
      templates: store,
      submit: {
        submissionId: `whole-${sha('abandoned-parent')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        units: {
          [`form:${fixture.formSectionId}`]: {
            unitType: 'FORM_SECTION',
            definitionHash: fixture.formDefHash,
            answers: [{ formItemId: fixture.formItemId, value: '7' }],
          },
        },
      },
    })).rejects.toMatchObject({ statusCode: 409, code: 'STALE_ATTEMPT' })
  })
})


describe('prepared ordinary Scale FINAL', () => {
  beforeEach(() => vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'))
  afterEach(() => vi.unstubAllEnvs())

  function fixture() {
    const f = buildFourFamilyTestSlots()
    const slot = f.slots.find(s => s.unitType === 'SCALE')!
    const plan = buildCompositePublicationPlan({ compositeId: randomUUID(), title: 'Frozen ordinary scales', slots: [slot] })
    const templates = makeTemplateStore()
    const input: CommitCompositeWholeFinalInput = {
      attempt: { id: randomUUID(), userId: randomUUID(), status: 'IN_PROGRESS', attemptEpoch: 1,
        compositeAssessmentId: plan.compositeId, publicationHash: plan.publicationHash,
        receiptOnly: true, startedAt: new Date('2026-11-24T01:00:00Z') },
      plan, templates: templates.store, draftCheckpointEnabled: false, now: new Date('2026-11-24T01:05:00Z'),
      submit: { submissionId: randomUUID(), attemptEpoch: 1, publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash, units: { [slot.slotKey]: { unitType: 'SCALE', definitionHash: slot.definitionHash,
          answers: f.scalePkg.goldenCases.find(c => c.expected.quality)!.answers } } },
    }
    const db = makeSingleRowFinalTxDb({status:'IN_PROGRESS',attemptEpoch:1,publicationHash:plan.publicationHash})
    Object.assign(db.parentState, { userId: input.attempt.userId, compositeAssessmentId: plan.compositeId,
      receiptOnly: true, startedAt: input.attempt.startedAt, subjectUserId: null, deliveryCourseId: null, trainingTimingSnapshot: null })
    return { ...db, input, templates }
  }

  it('prepares without opening a write transaction, preserves exact FINAL hashes/lengths, and never re-scores under the lock', async () => {
    const f = fixture(), old = makeSingleRowFinalTxDb({status:'IN_PROGRESS',attemptEpoch:1,publicationHash:f.input.plan.publicationHash})
    const legacy = await commitCompositeWholeFinal(old.db, f.input)
    const prepared = await prepareCompositeWholeFinal(f.input)
    expect(prepared).toBeDefined()
    expect(f.db.$queryRaw).not.toHaveBeenCalled()
    expect(f.db.$executeRaw).not.toHaveBeenCalled()
    const save = vi.spyOn(f.templates.store, 'saveMany').mockRejectedValue(new Error('must not recompute in transaction'))
    const receipt = await commitCompositeWholeFinal(f.db, f.input, prepared)
    expect(receipt).toEqual(legacy)
    const fresh = [...f.finals.values()][0], before = [...old.finals.values()][0]
    expect(fresh.factsCipher.length).toBe(before.factsCipher.length)
    expect(fresh.rawCipher.length).toBe(before.rawCipher.length)
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['userId', 'receiptOnly', 'trainingTimingSnapshot', 'attemptEpoch', 'publicationHash'])('rejects a concurrent %s change before any FINAL write', async field => {
    const f = fixture(), prepared = await prepareCompositeWholeFinal(f.input)
    Object.assign(f.parentState, { [field]: field === 'attemptEpoch' ? 2 : field === 'receiptOnly' ? false : field === 'trainingTimingSnapshot' ? { enabled: true } : randomUUID() })
    await expect(commitCompositeWholeFinal(f.db, f.input, prepared)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.finals.size).toBe(0)
    expect(f.attemptUpdates).toHaveLength(0)
  })

  it.each(['assignmentRef','consentId','recoveryTokenHash','respondentUserId'])('rechecks prepared %s under the parent lock',async field=>{
    const f=fixture()
    f.input.attempt.frozenState={[field]:null}
    Object.assign(f.parentState,{frozenState:{[field]:null}})
    const prepared=await prepareCompositeWholeFinal(f.input,f.db)
    Object.assign(f.parentState,{frozenState:{[field]:randomUUID()}})
    await expect(commitCompositeWholeFinal(f.db,f.input,prepared)).rejects.toMatchObject({code:'STALE_ATTEMPT',statusCode:409})
    expect(f.finals.size).toBe(0)
  })

  it('rejects request mutation between preparation and commit, and keeps authority checks inside the transaction', async () => {
    const f = fixture(), prepared = await prepareCompositeWholeFinal(f.input)
    f.input.submit.totalTimeMs = 999
    await expect(commitCompositeWholeFinal(f.db, f.input, prepared)).rejects.toThrow('Prepared FINAL input changed')
    expect(f.finals.size).toBe(0)
    delete f.input.submit.totalTimeMs
    f.input.verifyAuthorityInTx = async () => { throw new Error('revoked') }
    await expect(commitCompositeWholeFinal(f.db, f.input, prepared)).rejects.toThrow('revoked')
    expect(f.finals.size).toBe(0)
  })

  it('preserves historical replay and conflict precedence even when new computation fails', async () => {
    const f = fixture(), prepared = await prepareCompositeWholeFinal(f.input)
    await commitCompositeWholeFinal(f.db, f.input, prepared)
    f.input.verifyAuthorityInTx = async () => { throw new Error('revoked') }
    expect(await commitCompositeWholeFinal(f.db, f.input, prepared)).toMatchObject({replayed:true})
    const conflicting = { ...f.input, submit: { ...f.input.submit, units: {} } }
    const rejected = await prepareCompositeWholeFinal(conflicting)
    await expect(commitCompositeWholeFinal(f.db, conflicting, rejected)).rejects.toMatchObject({code:'SUBMISSION_PAYLOAD_CONFLICT'})
    expect(f.finals.size).toBe(1)
  })

  it.each([true, false])('prepares anonymous submissions and feedback with receiptOnly=%s', async receiptOnly => {
    const f = fixture()
    f.input.attempt.userId = null
    f.input.attempt.receiptOnly = receiptOnly
    Object.assign(f.parentState, {userId:null,receiptOnly})
    const buildFeedback = vi.fn(async () => ({headline:'prepared feedback'}))
    f.input.buildFeedback = buildFeedback
    const prepared = await prepareCompositeWholeFinal(f.input, f.db)
    expect(prepared).toBeDefined()
    expect(buildFeedback).toHaveBeenCalledTimes(receiptOnly ? 0 : 1)
    await commitCompositeWholeFinal(f.db, f.input, prepared)
    expect(buildFeedback).toHaveBeenCalledTimes(receiptOnly ? 0 : 1)
    expect(f.finals.size).toBe(1)
  })

  it('falls back safely when governance depends on a live wall clock',async()=>{
    const f=fixture()
    f.input.finalizeGovernanceInTx=async tx=>{await tx.$queryRaw`SELECT clock_timestamp() AS now`;return undefined}
    expect(await prepareCompositeWholeFinal(f.input,f.db)).toBeUndefined()
    expect(f.finals.size).toBe(0)
  })

  it('retains the fallback for unregistered mutable plans and mismatched publication identities', async () => {
    const f = fixture()
    for (const input of [
      {...f.input, plan:{...f.input.plan}},
      {...f.input, submit:{...f.input.submit,publicationHash:'0'.repeat(64)}},
      {...f.input, attempt:{...f.input.attempt,status:'ABANDONED'}},
    ]) expect(await prepareCompositeWholeFinal(input, f.db)).toBeUndefined()
  })
})
