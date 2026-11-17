import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const {
  mockFindUnique,
  mockBatchAdmissions,
  mockAssertDelivery,
  mockStoreSharedValidation,
  mockStoreWholeValidation,
  mockLoadSlotSet,
  mockLoadScaleRuntime,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockBatchAdmissions: vi.fn(),
  mockAssertDelivery: vi.fn(),
  mockStoreSharedValidation: vi.fn(),
  mockStoreWholeValidation: vi.fn(),
  mockLoadSlotSet: vi.fn(),
  mockLoadScaleRuntime: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    compositeAssessmentAttempt: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    },
  },
}))

vi.mock('../../modules/scale/unified-final-submit.service', () => ({
  assertUnifiedScaleDelivery: (...args: any[]) => mockAssertDelivery(...args),
  submitUnifiedScaleAssessmentFinal: vi.fn(),
  submitUnifiedScaleCollectionBatch: vi.fn(),
}))

vi.mock('../../modules/scale/scale-admission.service', async () => {
  const actual = await vi.importActual<typeof import('../../modules/scale/scale-admission.service')>(
    '../../modules/scale/scale-admission.service',
  )
  return {
    ...actual,
    batchEnsureScaleAdmissionsAtDelivery: (...args: any[]) => mockBatchAdmissions(...args),
    loadScaleAdmissionRuntime: (...args: any[]) => mockLoadScaleRuntime(...args),
  }
})

vi.mock('../../modules/assessment-runtime/slot-set', async () => {
  const actual = await vi.importActual<typeof import('../../modules/assessment-runtime/slot-set')>(
    '../../modules/assessment-runtime/slot-set',
  )
  return {
    ...actual,
    loadFrozenActiveSlotSet: (...args: any[]) => mockLoadSlotSet(...args),
  }
})

vi.mock('../../modules/assessment-runtime/report-outbox.service', async () => {
  const actual = await vi.importActual<typeof import('../../modules/assessment-runtime/report-outbox.service')>(
    '../../modules/assessment-runtime/report-outbox.service',
  )
  return {
    ...actual,
    storeWholeQuestionnaireValidation: (...args: any[]) => mockStoreWholeValidation(...args),
  }
})

vi.mock('../../modules/assessment-runtime/shared-control-records', async () => {
  const actual = await vi.importActual<typeof import('../../modules/assessment-runtime/shared-control-records')>(
    '../../modules/assessment-runtime/shared-control-records',
  )
  return {
    ...actual,
    withSharedControlContext: <T>(fn: () => Promise<T>) => fn(),
    storeSharedWholeValidation: (...args: any[]) => mockStoreSharedValidation(...args),
  }
})

vi.mock('../../modules/composite/composite.service', () => ({
  compositeFormSectionRuntimeDefinition: vi.fn(),
  compositeSectionHasContext: vi.fn(() => false),
}))

import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import {
  clearWholeQuestionnaireStaticCacheForTest,
  getWholeQuestionnaireDelivery,
  getWholeQuestionnaireTemplate,
} from '../../modules/composite/whole-questionnaire.service'

const def = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!.executable!.definition)
const runtime = createFrozenScaleRuntimeSnapshot({
  instrumentKey: 'adexi_v1',
  instrumentVersion: '2.0.0',
  definition: def,
  frozenAt: new Date('2026-11-15T00:00:00.000Z'),
})

const createFixtureAttempt = (opts: {
  attemptId: string
  userId: string
  childScaleId: string
  scaleName?: string
  scaleInstruction?: string | null
  slotSetHashOverride?: string
}) => {
  const slotSet = createFrozenActiveSlotSet({
    schemaVersion: 1,
    runtimeGeneration: 'UNIFIED_V1',
    attemptEpoch: 1,
    slots: [{
      slotKey: 'scale:comp-item-1',
      unitType: 'SCALE',
      required: true,
      sourceDefinitionIdentity: {
        key: runtime.instrumentKey,
        version: runtime.instrumentVersion,
        hash: runtime.sourceDefinitionHash,
      },
      sourceBinding: {
        scaleCode: 'adexi_v1',
        compositeItemId: 'comp-item-1',
        compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      },
    }],
  })
  const frozen = opts.slotSetHashOverride
    ? { ...slotSet, snapshotHash: opts.slotSetHashOverride }
    : slotSet

  const parent = {
    id: opts.attemptId,
    userId: opts.userId,
    recoveryTokenHash: null,
    status: 'IN_PROGRESS',
    progress: 0,
    completedAt: null,
    attemptEpoch: 1,
    asyncReportEpoch: 1,
    deliveryMode: 'FINAL_ONLY',
    runtimeGeneration: 'UNIFIED_V1',
    taskSatisfaction: null,
    frozenActiveSlotSetHash: frozen.snapshotHash,
    frozenActiveSlotSetEncrypted: `enc-slots:${frozen.snapshotHash}`,
    contextSnapshotHash: null,
    contextSnapshotEncrypted: null,
    aggregateInputHash: null,
    assignmentRef: null,
    deliveryCourseId: null,
    trainingTimingSnapshot: null,
    participantKey: null,
    trainingVariantAllocationEncrypted: null,
    trainingVariantAllocationHash: null,
    trainingFlowSnapshotEncrypted: null,
    trainingFlowSnapshotHash: null,
    trainingFlowPathEncrypted: null,
    trainingFlowPathHash: null,
    compositeAssessment: {
      id: 'comp-1',
      productKind: 'STANDARD',
      reportPackageKey: null,
      analysisProtocolKey: null,
      creationKey: null,
      publishedAt: new Date('2026-11-14T00:00:00.000Z'),
      trainingVariantDraft: null,
      trainingVariantFrozen: null,
      trainingFlowDraft: null,
      trainingFlowFrozen: null,
      trainingFlowDigest: null,
      trainingVariantDigest: null,
      items: [{
        id: 'comp-item-1',
        position: 0,
        presentationMode: 'ONE_BY_ONE',
      }],
      formSections: [],
    },
    scaleAssessments: [{
      id: opts.childScaleId,
      userId: opts.userId,
      status: 'IN_PROGRESS',
      compositeItemId: 'comp-item-1',
      attemptEpoch: 1,
      runtimeGeneration: 'UNIFIED_V1',
      deliveryMode: 'FINAL_ONLY',
      runtimeSnapshotEncrypted: 'enc-runtime-1',
      compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      frozenAdmissionSnapshotEncrypted: 'enc-adm-1',
      frozenAdmissionSnapshotHash: createHash('sha256').update(opts.childScaleId).digest('hex'),
      scale: {
        id: 'scale-master-1',
        code: 'adexi_v1',
        name: opts.scaleName ?? 'ADEXI Scale',
        instruction: opts.scaleInstruction === undefined ? 'Choose carefully' : opts.scaleInstruction,
        instrumentVersion: '2.0.0',
      },
    }],
  }
  return { parent, frozen }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearWholeQuestionnaireStaticCacheForTest()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_WHOLE_COMPACT_MANIFEST_ENABLED', 'true')
  mockLoadScaleRuntime.mockResolvedValue(runtime)
  mockAssertDelivery.mockResolvedValue(undefined)
  mockStoreSharedValidation.mockResolvedValue('enc-shared-validation')
  mockStoreWholeValidation.mockResolvedValue(undefined)
  mockBatchAdmissions.mockImplementation(async (_parent: any, children: any[]) => new Map(
    children.map(({ child }) => [child.id, {
      schemaVersion: 2,
      snapshotHash: child.frozenAdmissionSnapshotHash,
      trainingTiming: undefined,
      scalePolicy: null,
    }]),
  ))
})

afterEach(() => {
  vi.unstubAllEnvs()
  clearWholeQuestionnaireStaticCacheForTest()
})

describe('whole template split delivery & controller guard contracts', () => {
  it('delivers full definition on miss and compact binding when client advertises matching templateHash', async () => {
    const f1 = createFixtureAttempt({ attemptId: 'attempt-1', userId: 'student-1', childScaleId: 'child-1' })
    const f2 = createFixtureAttempt({ attemptId: 'attempt-2', userId: 'student-2', childScaleId: 'child-2' })

    const byAttempt = new Map([
      ['attempt-1', f1],
      ['attempt-2', f2],
    ])
    mockFindUnique.mockImplementation(async ({ where }: any) => byAttempt.get(where.id)?.parent ?? null)
    mockLoadSlotSet.mockImplementation(async (enc: string) => {
      const hash = enc.replace('enc-slots:', '')
      for (const entry of byAttempt.values()) {
        if (entry.frozen.snapshotHash === hash) return entry.frozen
      }
      throw new Error('missing slot set')
    })

    // 1. Cold client -> returns full definition with templateHash and populates shared plan cache
    const first = await getWholeQuestionnaireDelivery('attempt-1', { userId: 'student-1' })
    expect(first.mode).toBe('definition')
    if (first.mode !== 'definition') throw new Error('expected definition')
    const templateHash = first.definition.templateHash
    expect(templateHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.definition.units[0]?.scaleAssessmentId).toBe('child-1')

    const firstSharedCallPlan = mockStoreSharedValidation.mock.calls[0]?.[1]
    expect(firstSharedCallPlan?.hash).toMatch(/^[a-f0-9]{64}$/)

    // 2. Second student with knownTemplateHashes -> returns lightweight binding reusing same validation plan
    const secondBound = await getWholeQuestionnaireDelivery(
      'attempt-2',
      { userId: 'student-2' },
      { knownTemplateHashes: new Set([templateHash]) },
    )
    expect(secondBound.mode).toBe('binding')
    if (secondBound.mode !== 'binding') throw new Error('expected binding')
    expect(secondBound.binding).toEqual({
      attemptId: 'attempt-2',
      attemptEpoch: 1,
      slotSetHash: f2.frozen.snapshotHash,
      contextSnapshotHash: null,
      templateHash,
      units: [{
        itemId: 'comp-item-1',
        scaleAssessmentId: 'child-2',
        definitionHash: runtime.legacyDefinitionHash,
        presentationMode: 'ONE_BY_ONE',
      }],
    })
    expect(mockStoreSharedValidation.mock.calls[1]?.[1]).toBe(firstSharedCallPlan)

    // 3. Recombining template endpoint DTO with binding matches full definition for student-2
    const templateDto = await getWholeQuestionnaireTemplate('attempt-2', templateHash, { userId: 'student-2' })
    const secondFull = await getWholeQuestionnaireDelivery('attempt-2', { userId: 'student-2' })
    expect(secondFull.mode).toBe('definition')
    if (secondFull.mode !== 'definition') throw new Error('expected definition')

    const reassembled = {
      attemptId: secondBound.binding.attemptId,
      attemptEpoch: secondBound.binding.attemptEpoch,
      slotSetHash: secondBound.binding.slotSetHash,
      contextSnapshotHash: secondBound.binding.contextSnapshotHash,
      templateHash: templateDto.templateHash,
      units: secondBound.binding.units.map(bound => {
        const tmplUnit = templateDto.units.find(u => u.itemId === bound.itemId)!
        return {
          ...tmplUnit,
          scaleAssessmentId: bound.scaleAssessmentId,
        }
      }),
      formSections: templateDto.formSections,
    }
    expect(reassembled).toEqual(secondFull.definition)
  })

  it('serves template from cold cache, enforces ownership & version mismatch, and invalidates when live display changes', async () => {
    const base = createFixtureAttempt({ attemptId: 'attempt-1', userId: 'student-1', childScaleId: 'child-1' })
    mockFindUnique.mockImplementation(async () => base.parent)
    mockLoadSlotSet.mockResolvedValue(base.frozen)

    const initial = await getWholeQuestionnaireDelivery('attempt-1', { userId: 'student-1' })
    if (initial.mode !== 'definition') throw new Error('expected definition')
    const initialHash = initial.definition.templateHash

    // Wrong owner rejected (cache hit fast-path)
    await expect(
      getWholeQuestionnaireTemplate('attempt-1', initialHash, { userId: 'attacker' }),
    ).rejects.toMatchObject({ statusCode: 403 })

    // Malformed hash rejected
    await expect(
      getWholeQuestionnaireTemplate('attempt-1', 'not-sha256', { userId: 'student-1' }),
    ).rejects.toMatchObject({ statusCode: 400 })

    // Cold cache rebuilds template cleanly without hitting previous in-memory entry
    clearWholeQuestionnaireStaticCacheForTest()
    const rebuilt = await getWholeQuestionnaireTemplate('attempt-1', initialHash, { userId: 'student-1' })
    expect(rebuilt.templateHash).toBe(initialHash)
    expect(rebuilt.units[0]?.scale.name).toBe('ADEXI Scale')

    // Mutate live scale display name without changing frozenActiveSlotSetHash -> new templateHash!
    base.parent.scaleAssessments[0]!.scale.name = 'ADEXI Scale (Updated)'
    const staleAttempt = await getWholeQuestionnaireDelivery(
      'attempt-1',
      { userId: 'student-1' },
      { knownTemplateHashes: new Set([initialHash]) },
    )
    expect(staleAttempt.mode).toBe('definition')
    if (staleAttempt.mode !== 'definition') throw new Error('expected full definition after display change')
    expect(staleAttempt.definition.templateHash).not.toBe(initialHash)
    expect(staleAttempt.definition.units[0]?.scale.name).toBe('ADEXI Scale (Updated)')

    await expect(
      getWholeQuestionnaireTemplate('attempt-1', initialHash, { userId: 'student-1' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('bounds anonymous 9-unit delivery validation concurrency to <= 2 while keeping authenticated validation parallel', async () => {
    const unitCount = 9
    const createNineUnitFixture = (opts: {
      attemptId: string
      userId: string | null
      recoveryTokenHash: string | null
    }) => {
      const slotSet = createFrozenActiveSlotSet({
        schemaVersion: 1,
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        slots: Array.from({ length: unitCount }, (_, i) => ({
          slotKey: `scale:comp-item-${i}`,
          unitType: 'SCALE' as const,
          required: true,
          sourceDefinitionIdentity: {
            key: runtime.instrumentKey,
            version: runtime.instrumentVersion,
            hash: runtime.sourceDefinitionHash,
          },
          sourceBinding: {
            scaleCode: `adexi_v1_${i}`,
            compositeItemId: `comp-item-${i}`,
            compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
          },
        })),
      })
      return {
        frozen: slotSet,
        parent: {
          id: opts.attemptId,
          userId: opts.userId,
          recoveryTokenHash: opts.recoveryTokenHash,
          status: 'IN_PROGRESS',
          progress: 0,
          completedAt: null,
          attemptEpoch: 1,
          asyncReportEpoch: 1,
          deliveryMode: 'FINAL_ONLY',
          runtimeGeneration: 'UNIFIED_V1',
          taskSatisfaction: null,
          frozenActiveSlotSetHash: slotSet.snapshotHash,
          frozenActiveSlotSetEncrypted: `enc-slots:${slotSet.snapshotHash}`,
          contextSnapshotHash: null,
          contextSnapshotEncrypted: null,
          aggregateInputHash: null,
          assignmentRef: null,
          deliveryCourseId: null,
          trainingTimingSnapshot: null,
          participantKey: null,
          trainingVariantAllocationEncrypted: null,
          trainingVariantAllocationHash: null,
          trainingFlowSnapshotEncrypted: null,
          trainingFlowSnapshotHash: null,
          trainingFlowPathEncrypted: null,
          trainingFlowPathHash: null,
          compositeAssessment: {
            id: 'comp-9',
            productKind: 'STANDARD',
            reportPackageKey: null,
            analysisProtocolKey: null,
            creationKey: null,
            publishedAt: new Date('2026-11-14T00:00:00.000Z'),
            trainingVariantDraft: null,
            trainingVariantFrozen: null,
            trainingFlowDraft: null,
            trainingFlowFrozen: null,
            trainingFlowDigest: null,
            trainingVariantDigest: null,
            items: Array.from({ length: unitCount }, (_, i) => ({
              id: `comp-item-${i}`,
              position: i,
              presentationMode: 'ONE_BY_ONE',
            })),
            formSections: [],
          },
          scaleAssessments: Array.from({ length: unitCount }, (_, i) => ({
            id: `${opts.attemptId}-child-${i}`,
            userId: opts.userId,
            status: 'IN_PROGRESS',
            compositeItemId: `comp-item-${i}`,
            attemptEpoch: 1,
            runtimeGeneration: 'UNIFIED_V1',
            deliveryMode: 'FINAL_ONLY',
            runtimeSnapshotEncrypted: `enc-runtime-${i}`,
            compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
            frozenAdmissionSnapshotEncrypted: `enc-adm-${i}`,
            frozenAdmissionSnapshotHash: createHash('sha256').update(`${opts.attemptId}-${i}`).digest('hex'),
            scale: {
              id: `scale-master-${i}`,
              code: `adexi_v1_${i}`,
              name: `ADEXI Scale ${i}`,
              instruction: 'Choose carefully',
              instrumentVersion: '2.0.0',
            },
          })),
        },
      }
    }

    const anonHash = createHash('sha256').update('anon-secret').digest('hex')
    const anonFixture = createNineUnitFixture({
      attemptId: 'attempt-anon-9',
      userId: null,
      recoveryTokenHash: anonHash,
    })
    const authFixture = createNineUnitFixture({
      attemptId: 'attempt-auth-9',
      userId: 'student-9',
      recoveryTokenHash: null,
    })

    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === anonFixture.parent.id) return anonFixture.parent
      if (where.id === authFixture.parent.id) return authFixture.parent
      return null
    })
    mockLoadSlotSet.mockImplementation(async (enc: string) => {
      if (enc.endsWith(anonFixture.frozen.snapshotHash)) return anonFixture.frozen
      if (enc.endsWith(authFixture.frozen.snapshotHash)) return authFixture.frozen
      throw new Error('missing slot set')
    })

    // Anonymous path: hold deferred promises to measure peak in-flight concurrency
    let inFlight = 0
    let maxAnonInFlight = 0
    const pendingAnon: Array<() => void> = []
    mockAssertDelivery.mockImplementation(() => {
      inFlight += 1
      maxAnonInFlight = Math.max(maxAnonInFlight, inFlight)
      return new Promise<void>((resolve) => {
        pendingAnon.push(() => {
          inFlight -= 1
          resolve()
        })
      })
    })

    const anonPromise = getWholeQuestionnaireDelivery('attempt-anon-9', { recoveryTokenHash: anonHash })
    for (let step = 0; step < unitCount; step += 1) {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(maxAnonInFlight).toBeLessThanOrEqual(2)
      while (pendingAnon.length > 0) {
        pendingAnon.shift()!()
      }
    }
    const anonResult = await anonPromise
    expect(anonResult.mode).toBe('definition')
    expect(mockAssertDelivery).toHaveBeenCalledTimes(unitCount)
    expect(maxAnonInFlight).toBe(2)

    // Authenticated path: preserves full parallel Promise.all validation
    mockAssertDelivery.mockClear()
    inFlight = 0
    let maxAuthInFlight = 0
    const pendingAuth: Array<() => void> = []
    mockAssertDelivery.mockImplementation(() => {
      inFlight += 1
      maxAuthInFlight = Math.max(maxAuthInFlight, inFlight)
      return new Promise<void>((resolve) => {
        pendingAuth.push(() => {
          inFlight -= 1
          resolve()
        })
      })
    })
    const authPromise = getWholeQuestionnaireDelivery('attempt-auth-9', { userId: 'student-9' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(maxAuthInFlight).toBe(unitCount)
    while (pendingAuth.length > 0) pendingAuth.shift()!()
    const authResult = await authPromise
    expect(authResult.mode).toBe('definition')
    expect(mockAssertDelivery).toHaveBeenCalledTimes(unitCount)
  })

  it('hits the template cache fast-path for freshly started ORGANIZATION_RESOURCE education attempts with asyncReportEpoch=null', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    const edu = createFixtureAttempt({ attemptId: 'attempt-edu-1', userId: 'teacher-1', childScaleId: 'child-edu-1' })
    edu.parent.asyncReportEpoch = null as unknown as number
    edu.parent.assignmentRef = 'assignment-edu-1'
    edu.parent.compositeAssessment.productKind = 'ORGANIZATION_RESOURCE'
    mockFindUnique.mockResolvedValue(edu.parent)
    mockLoadSlotSet.mockResolvedValue(edu.frozen)

    const delivered = await getWholeQuestionnaireDelivery('attempt-edu-1', { userId: 'teacher-1' })
    if (delivered.mode !== 'definition') throw new Error('expected definition')

    mockLoadSlotSet.mockClear()
    const cachedDto = await getWholeQuestionnaireTemplate('attempt-edu-1', delivered.definition.templateHash, { userId: 'teacher-1' })
    expect(cachedDto.templateHash).toBe(delivered.definition.templateHash)
    expect(mockLoadSlotSet).not.toHaveBeenCalled()
  })
})
