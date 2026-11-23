import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from './phase2-test-fixtures'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import {
  buildCompositePublicationPlan,
  generateCompositeUnitSeeds,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { saveCompositeCheckpoint } from '../../modules/assessment-runtime/composite-checkpoint.service'
import { commitCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
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
function makeSingleRowFinalTxDb() {
  const finals = new Map<string, any>()
  const finalsBySubmission = new Map<string, any>()
  const checkpoints = new Map<string, any>()
  const attemptUpdates: any[] = []
  const executionUpdates: string[] = []
  const assignmentUpdates: string[] = []
  const executedSqls: string[] = []

  const db: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      executedSqls.push(text)
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
        attemptUpdates.push(sql.values)
        return 1
      }
      if (text.includes('UPDATE assessment_run_executions')) {
        executionUpdates.push(sql.values[2])
        return 1
      }
      if (text.includes('UPDATE relational_assessment_assignments')) {
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
  return { db, finals, checkpoints, attemptUpdates, executionUpdates, assignmentUpdates, executedSqls }
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
    const { db, finals, checkpoints, attemptUpdates, executionUpdates, assignmentUpdates, executedSqls } = makeSingleRowFinalTxDb()
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
          answers: scaleGold.answers,
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

    const receipt = await commitCompositeWholeFinal(db, {
      attempt,
      plan,
      submit: submitPayload,
      templates: store,
      educationRun: { executionId, assignmentId },
      buildFeedback: async facts => ({
        headline: '四合一反馈完成',
        unitCount: Object.keys(facts.units).length,
      }),
      now: new Date('2026-11-24T01:01:35.000Z'),
    })

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
    }

    const rawMap = await readCompositeFinalRawBatch(db, [{ attemptId, attemptEpoch: 1 }])
    const raw = rawMap.get(`${attemptId}:1`)!.raw
    expect(Object.keys(raw.units)).toHaveLength(4)

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

  it('rejects tampered locked Cognitive trials (409), wrong randomSeed (409), and missing required units (400)', async () => {
    const { store } = makeTemplateStore()
    const { db } = makeSingleRowFinalTxDb()
    const fixture = buildFourFamilyTestSlots()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '防篡改校验卷',
      slots: fixture.slots,
    })
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
  })
})
