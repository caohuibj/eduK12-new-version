import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from '../assessment-runtime/phase2-test-fixtures'
import {
  buildCompositePublicationPlan,
  cacheCommittedCompositePublicationPlan,
  clearCompositePublicationPlanCacheForTests,
  generateCompositeUnitSeeds,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { commitCompositeWholeFinal } from '../../modules/assessment-runtime/composite-final.writer'
import { createPublicTemplateStore } from '../../modules/assessment-runtime/public-templates'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { gonogoSequence } from '../../modules/cognitive/randomization'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const { inMemoryFinals, inMemoryTemplates, mockPrisma } = vi.hoisted(() => {
  const inMemoryFinals = new Map<string, any>()
  const inMemoryTemplates = new Map<string, any>()
  const mockPrisma: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql)
        ? sql.join('?')
        : Array.isArray(sql?.strings)
          ? sql.strings.join('?')
          : String(sql?.sql ?? '')
      if (text.includes('FROM composite_attempt_finals')) {
        return [...inMemoryFinals.values()]
      }
      if (text.includes('FROM assessment_public_templates')) {
        return [...inMemoryTemplates.values()]
      }
      return []
    }),
    $executeRaw: vi.fn(async () => 1),
    assessment: {
      findMany: vi.fn(() => { throw new Error('Legacy assessments must not be queried for WHOLE_V2 buildCompositeReport') }),
    },
    compositeFormAnswer: {
      findMany: vi.fn(() => { throw new Error('Legacy composite_form_answers must not be queried for WHOLE_V2 buildCompositeReport') }),
    },
    compositeFormSectionAttempt: {
      findMany: vi.fn(() => { throw new Error('Legacy composite_form_section_attempts must not be queried for WHOLE_V2 buildCompositeReport') }),
    },
  }
  return { inMemoryFinals, inMemoryTemplates, mockPrisma }
})

vi.mock('../../config/database', () => ({
  prisma: mockPrisma,
}))

function makeGonogoTrials(randomSeed: string, count = 8) {
  return gonogoSequence(randomSeed, count, 0.25).map((trialType, idx) => ({
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
      responded: trialType !== 'nogo',
      rtMs: trialType === 'nogo' ? null : 350 + idx * 5,
      interrupted: false,
    },
  }))
}

describe('buildCompositeReport WHOLE_V2 Facts adapter (P1-01 & P1-03)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    inMemoryFinals.clear()
    inMemoryTemplates.clear()
    clearCompositePublicationPlanCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    clearCompositePublicationPlanCacheForTests()
  })

  it('builds complete 4-family backgroundValues + unitReports from composite_attempt_finals with empty legacy child arrays', async () => {
    const { buildCompositeReport } = await import('../../modules/composite/composite.service')
    const fixture = buildFourFamilyTestSlots()
    const compositeId = randomUUID()
    const attemptId = randomUUID()

    const scaleSource = getScaleInstrumentSource(fixture.scalePkg.key, fixture.scalePkg.instrumentVersion)
    const compiledPolicy = scaleSource ? compileScalePolicy(scaleSource) : undefined
    const slots = fixture.slots.map(slot => (
      slot.unitType === 'SCALE'
        ? {
            ...slot,
            instrumentClass: 'STANDARD' as const,
            ...(compiledPolicy ? { compiledPolicy, runtimePolicyHash: compiledPolicy.runtimePolicyHash } : {}),
          }
        : slot
    ))
    const plan = buildCompositePublicationPlan({
      compositeId,
      title: 'Training 四合一整卷报告测试',
      slots,
    })
    cacheCommittedCompositePublicationPlan(plan)

    const templateStore = createPublicTemplateStore({
      read: async hashes => hashes.flatMap(h => (inMemoryTemplates.has(h) ? [inMemoryTemplates.get(h)!] : [])),
      append: async rows => {
        for (const r of rows) inMemoryTemplates.set(r.templateHash, r)
      },
    })

    const writerDb: any = {
      $queryRaw: vi.fn(async (sql: any) => {
        const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
        if (text.includes('FROM composite_assessment_attempts')) {
          return [{ status: 'IN_PROGRESS', attemptEpoch: 1, publicationHash: plan.publicationHash }]
        }
        return []
      }),
      $executeRaw: vi.fn(async (sql: any) => {
        const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
        if (text.includes('INSERT INTO composite_attempt_finals')) {
          const [
            aId, epoch, cId, orgId, courseId,
            pubHash, slotHash, ctxHash, subId,
            pHash, aggHash, fHash, fCipher,
            rHash, rCipher, fbCipher, doneAt,
          ] = sql.values
          inMemoryFinals.set(`${aId}:${epoch}`, {
            attemptId: aId,
            attemptEpoch: epoch,
            compositeId: cId,
            organizationId: orgId,
            courseId,
            publicationHash: pubHash,
            slotSetHash: slotHash,
            contextHash: ctxHash,
            submissionId: subId,
            payloadHash: pHash,
            aggregateHash: aggHash,
            factsHash: fHash,
            factsCipher: fCipher,
            rawHash: rHash,
            rawCipher: rCipher,
            feedbackCipher: fbCipher,
            completedAt: doneAt,
          })
        }
        return 1
      }),
    }

    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const formSlotKey = `form:${fixture.formSectionId}`
    const scaleSlotKey = `scale:${fixture.scaleItemId}`
    const sjtSlotKey = `situational:${fixture.sjtItemId}`
    const cogSlotKey = `cognitive:${fixture.cogItemId}`
    const scaleGold = fixture.scalePkg.goldenCases.find(c => c.expected.quality)!
    const sjtGold = fixture.sjtPkg.goldenCases[0]
    const sjtResponses = Object.fromEntries(
      sjtGold.responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]),
    )

    const receipt = await commitCompositeWholeFinal(writerDb, {
      attempt: {
        id: attemptId,
        compositeAssessmentId: compositeId,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        unitSeedsEncrypted: seeds.encrypted,
        receiptOnly: false,
        startedAt: new Date('2026-11-24T02:00:00.000Z'),
      },
      plan,
      submit: {
        submissionId: `whole-${sha('v2-report-adapter-test')}`,
        attemptEpoch: 1,
        publicationHash: plan.publicationHash,
        slotSetHash: plan.slotSetHash,
        totalTimeMs: 45_000,
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
            totalTimeMs: 9000,
          },
          [cogSlotKey]: {
            unitType: 'COGNITIVE',
            definitionHash: fixture.cogDefHash,
            randomSeed: seeds.seeds[cogSlotKey],
            trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
          },
        },
      },
      templates: templateStore,
      now: new Date('2026-11-24T02:00:45.000Z'),
    })
    expect(receipt.status).toBe('COMPLETED')

    // Build report with ZERO legacy child rows
    const scalePlanSlot = plan.slots.find(s => s.unitType === 'SCALE')!
    const report = await buildCompositeReport({
      id: attemptId,
      compositeAssessmentId: compositeId,
      attemptEpoch: 1,
      status: 'COMPLETED',
      publicationHash: plan.publicationHash,
      anonymousCode: null,
      completedAt: new Date('2026-11-24T02:00:45.000Z'),
      totalTime: 45,
      trainingVariantAllocationEncrypted: null,
      trainingVariantAllocationHash: null,
      trainingFlowSnapshotEncrypted: null,
      trainingFlowSnapshotHash: null,
      trainingFlowPathEncrypted: null,
      trainingFlowPathHash: null,
      scaleAssessments: [],
      cognitiveSessions: [],
      situationalAttempts: [],
      formAnswers: [],
      compositeAssessment: {
        id: compositeId,
        name: 'Training 四合一整卷报告测试',
        productKind: 'QUESTIONNAIRE',
        reportPackageKey: null,
        reportPackageSnapshotEncrypted: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        items: [
          {
            id: fixture.formItemId,
            type: 'FORM',
            position: 0,
            formType: 'single_choice',
            formLabel: '年级',
            formOptions: [
              { value: '7', label: '七年级' },
              { value: '8', label: '八年级' },
              { value: '9', label: '九年级' },
            ],
            contextKey: 'gradeLevel',
          },
          {
            id: fixture.scaleItemId,
            type: 'SCALE',
            position: 1,
            scaleId: scalePlanSlot.unitType === 'SCALE' ? scalePlanSlot.scaleId : randomUUID(),
            scale: {
              id: scalePlanSlot.unitType === 'SCALE' ? scalePlanSlot.scaleId : randomUUID(),
              code: fixture.scalePkg.key,
              name: fixture.scalePkg.key,
              instrumentVersion: fixture.scalePkg.instrumentVersion,
              instrumentClass: 'STANDARD',
            },
          },
          {
            id: fixture.sjtItemId,
            type: 'SITUATIONAL',
            position: 2,
            situationalInstrumentKey: fixture.sjtPkg.key,
            situationalInstrumentVersion: fixture.sjtPkg.instrumentVersion,
          },
          {
            id: fixture.cogItemId,
            type: 'COGNITIVE',
            position: 3,
            cognitiveAssignment: {
              id: randomUUID(),
              title: 'Go/No-Go',
              profile: 'standard',
              resolvedReportSnapshotEncrypted: null,
              config: { testType: 'gonogo', name: 'Go/No-Go' },
            },
          },
        ],
      },
    })

    // 1. Form backgroundValues populated from FINAL facts (zero legacy composite_form_answers reads)
    expect(report.backgroundValues).toHaveLength(1)
    expect(report.backgroundValues[0].itemId).toBe(fixture.formItemId)
    expect(report.backgroundValues[0].value).toBe('8')

    // 2. All 3 measurement unitReports populated with zero decryptError
    expect(report.unitReports).toHaveLength(3)
    const scaleReport = report.unitReports.find((u: any) => u.type === 'SCALE')
    expect(scaleReport).toBeDefined()
    expect(scaleReport.decryptError).toBeFalsy()
    expect(scaleReport.scores.length).toBeGreaterThan(0)
    if (compiledPolicy) {
      expect(scaleReport.__scaleProjectionPolicy?.disposition).toBe('FROZEN_V2')
      expect(scaleReport.__scaleProjectionPolicy?.runtimePolicyHash).toBe(compiledPolicy.runtimePolicyHash)
    }

    const sjtReport = report.unitReports.find((u: any) => u.type === 'SITUATIONAL')
    expect(sjtReport).toBeDefined()
    expect(sjtReport.decryptError).toBeFalsy()
    expect(sjtReport.metrics.length).toBeGreaterThan(0)

    const cogReport = report.unitReports.find((u: any) => u.type === 'COGNITIVE')
    expect(cogReport).toBeDefined()
    expect(cogReport.decryptError).toBeFalsy()
    expect(cogReport.testType).toBe('gonogo')
    expect(cogReport.singleTaskReport).toBeTruthy()
    expect(Object.keys(cogReport.metrics).length).toBeGreaterThan(0)

    // 3. Zero legacy child table queries occurred
    expect(mockPrisma.assessment.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.compositeFormAnswer.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.compositeFormSectionAttempt.findMany).not.toHaveBeenCalled()
  })
})
