import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  canonicalHash,
  canonicalJsonString,
  CanonicalJsonError,
} from '../../modules/assessment-runtime/canonical'
import {
  compileBundleRuntime,
  parseCompiledInstrumentRuntime,
} from '../../modules/assessment-runtime/compiler'
import {
  freezeCompositeActiveSlotSet,
  freezeQuestionnaireActiveSlotSet,
} from '../../modules/assessment-runtime/attempt-runtime'
import {
  createCanonicalUnitResultEnvelope,
  parseCanonicalUnitResultEnvelope,
  projectCognitiveCanonicalUnitResult,
  projectScaleCanonicalUnitResult,
} from '../../modules/assessment-runtime/unit-result'
import { createFormSectionCollectionFacts, parseFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
import type { CompiledInstrumentRuntimeV1 } from '../../modules/assessment-runtime/types'
import type { ScaleResultV2 } from '../../modules/scale/scale-result'
import type { CognitiveResultSnapshot, TaskDefinition } from '../../modules/cognitive/v2/types'
import { validateAndNormalizeTrials } from '../../modules/cognitive/v2/trial-normalizer'

describe('V32-1 canonical JSON contract', () => {
  it('keeps object ordering deterministic, preserves arrays, and normalizes -0', () => {
    const fixture = {
      z: 1,
      a: { d: 'x', b: 2 },
      arr: [3, -0, null],
    }

    expect(canonicalJsonString(fixture)).toBe('{"a":{"b":2,"d":"x"},"arr":[3,0,null],"z":1}')
    expect(canonicalHash(fixture)).toBe('54e365b52a2d99612ae59733fc008cd229cadfb090db18c6598d86491fe29167')
    expect(canonicalJsonString({ arr: [null, 3, 0] })).not.toBe(canonicalJsonString({ arr: [3, 0, null] }))
  })

  it('rejects values that are not part of the JSON runtime boundary', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const unsupported: unknown[] = [undefined, Number.NaN, Number.POSITIVE_INFINITY, () => null, Symbol('x'), new Date(), circular]

    for (const value of unsupported) {
      expect(() => canonicalJsonString(value)).toThrow(CanonicalJsonError)
    }
  })

  it('does not allow a __proto__ key to mutate the canonicalizer accumulator', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as unknown
    expect(canonicalJsonString(value)).toBe('{"__proto__":{"polluted":true},"a":1}')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })
})

describe('V32-1 compiled runtime and frozen slots', () => {
  it('round-trips a serializable compiled runtime and its golden identity', () => {
    const runtime = compileBundleRuntime({
      instrumentKey: 'bundle.demo',
      instrumentVersion: '1.0.0',
      sourceDefinitionHash: 'a'.repeat(64),
      reportDefinition: { title: 'Demo' },
      aggregateProjection: {
        allowedMetricKeys: ['score'],
        allowedFactKeys: ['quality.status'],
        allowedReferenceClassifications: [],
      },
      referenceBindingDefinition: { required: false, selections: [] },
    })

    expect(runtime.compiledRuntimeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(parseCompiledInstrumentRuntime(runtime)).toEqual(runtime)
    expect(canonicalJsonString(runtime)).not.toContain('function')
  })

  it('freezes only server-derived active slots with deterministic ordering', () => {
    const questionnaire = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 2,
      scales: [{
        questionnaireScaleId: 'scale-binding-1',
        code: 'scale.demo',
        instrumentVersion: '2.0.0',
        sourceDefinitionHash: 'b'.repeat(64),
      }],
      formSections: [{ sectionId: 'section-1', definitionHash: 'c'.repeat(64) }],
    })
    expect(questionnaire.slots.map((slot) => slot.slotKey)).toEqual(['form-section:section-1', 'scale:scale-binding-1'])
    expect(questionnaire.snapshotHash).toBe(canonicalHash({
      schemaVersion: 1,
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 2,
      slots: questionnaire.slots,
    }))

    const composite = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [],
      cognitive: [{
        compositeItemId: 'item-1',
        testType: 'stroop',
        instrumentVersion: '1.0.0',
        sourceDefinitionHash: 'd'.repeat(64),
        compiledRuntimeHash: 'e'.repeat(64),
      }],
      formSections: [],
    })
    expect(composite.slots[0].sourceDefinitionIdentity.hash).toBe('d'.repeat(64))
    expect(composite.slots[0].sourceBinding).toMatchObject({ compiledRuntimeHash: 'e'.repeat(64) })
    expect(() => freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 1,
      scales: [
        { questionnaireScaleId: 'same', code: 'a', instrumentVersion: '1', sourceDefinitionHash: 'a'.repeat(64) },
        { questionnaireScaleId: 'same', code: 'b', instrumentVersion: '1', sourceDefinitionHash: 'b'.repeat(64) },
      ],
      formSections: [],
    })).toThrow(/unique/)
  })
})

const scaleRuntime = (): CompiledInstrumentRuntimeV1 => ({
  schemaVersion: 1,
  compilerVersion: 'test-compiler',
  instrumentType: 'SCALE',
  instrumentKey: 'scale.demo',
  instrumentVersion: '1.0.0',
  sourceDefinitionHash: 'a'.repeat(64),
  compiledRuntimeHash: 'b'.repeat(64),
  hashScheme: 'CANONICAL_JSON_SHA256_V1',
  scorerKey: 'scale.default',
  scorerVersion: '1.0.0',
  metricDefinitions: { total: { key: 'total', label: 'Total', valueType: 'number' } },
  qualityDefinitions: {},
  reportDefinition: {},
  aggregateProjection: {
    allowedMetricKeys: ['total'],
    allowedFactKeys: ['quality.status'],
    allowedReferenceClassifications: [],
  },
  referenceBindingDefinition: { required: false, selections: [] },
  runtimeCapabilities: {
    standalone: true,
    embedded: true,
    aggregateEligible: true,
    collectionFacts: false,
    supported: true,
  },
})

describe('V32-1 canonical unit result and collection facts', () => {
  it('projects Scale without raw answer fields and verifies the encrypted-envelope contract inputs', () => {
    const result = {
      quality: { status: 'interpretable', flags: [] },
      scores: [{
        key: 'total',
        type: 'total',
        label: 'Total',
        description: undefined,
        direction: 'higher_is_better',
        canonical: true,
        displayPrecision: 1,
        value: 12,
        range: { min: 0, max: 20 },
        expectedItems: ['q1'],
        answeredItems: ['q1'],
        status: 'calculated',
        prorated: false,
      }],
      references: [],
    } as unknown as ScaleResultV2
    const core = projectScaleCanonicalUnitResult({
      result,
      runtime: scaleRuntime(),
      contextHash: 'context-hash',
    })

    expect(core.unitType).toBe('SCALE')
    expect(core.metrics).toEqual([{ key: 'total', value: 12, unit: 'score', quality: 'calculated' }])
    expect(core).not.toHaveProperty('itemScores')
    expect(JSON.stringify(core)).not.toContain('responseValue')

    const envelope = createCanonicalUnitResultEnvelope({
      core,
      completedAt: '2026-09-01T00:00:00.000Z',
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-1' },
    })
    expect(parseCanonicalUnitResultEnvelope(envelope)).toEqual(envelope)
    expect(envelope.resultHash).toBe(canonicalHash(core))
  })

  it('round-trips bundleBridge with additive bundleBridgeHash without folding into resultHash', () => {
    const result = {
      schemaVersion: 2,
      instrument: {
        scaleId: 'scale-1',
        code: 'who5',
        name: 'WHO-5',
        instrumentVersion: '1.0.0',
      },
      method: {
        scaleId: 'scale-1',
        instrumentVersion: '1.0.0',
        scoringVersion: '1.0.0',
        reportVersion: '1.0.0',
        definitionHash: 'def',
        referenceVersions: [],
        assessmentContext: null,
      },
      quality: { status: 'interpretable', flags: [] },
      itemScores: [],
      scores: [{
        key: 'total',
        type: 'total',
        label: 'Total',
        direction: 'higher_is_better',
        canonical: true,
        displayPrecision: 1,
        value: 12,
        range: { min: 0, max: 20 },
        expectedItems: ['q1'],
        answeredItems: ['q1'],
        status: 'calculated',
        prorated: false,
      }],
      references: [],
    } as unknown as ScaleResultV2
    const core = projectScaleCanonicalUnitResult({
      result,
      runtime: scaleRuntime(),
      contextHash: 'context-hash',
    })
    const bridge = {
      sourceResultHash: 'b'.repeat(64),
      scores: [{
        scoreKey: 'total',
        value: 12,
        status: 'calculated' as const,
        criterionBandKey: 'who5.total.band',
      }],
    }
    const envelope = createCanonicalUnitResultEnvelope({
      core,
      completedAt: '2026-09-01T00:00:00.000Z',
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-bridge' },
      bundleBridge: bridge,
    })
    expect(envelope.resultHash).toBe(canonicalHash(core))
    expect(envelope.bundleBridgeHash).toBe(canonicalHash(bridge))
    expect(envelope.bundleBridgeHash).not.toBe(envelope.resultHash)
    expect(parseCanonicalUnitResultEnvelope(envelope)).toEqual(envelope)
    expect(createCanonicalUnitResultEnvelope({
      core,
      completedAt: '2026-09-01T00:00:00.000Z',
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-bridge' },
    })).not.toHaveProperty('bundleBridgeHash')
  })

  it('rejects bridge tampering when core/resultHash stay valid', () => {
    const core = projectScaleCanonicalUnitResult({
      result: {
        schemaVersion: 2,
        instrument: {
          scaleId: 'scale-1',
          code: 'who5',
          name: 'WHO-5',
          instrumentVersion: '1.0.0',
        },
        method: {
          scaleId: 'scale-1',
          instrumentVersion: '1.0.0',
          scoringVersion: '1.0.0',
          reportVersion: '1.0.0',
          definitionHash: 'def',
          referenceVersions: [],
          assessmentContext: null,
        },
        quality: { status: 'interpretable', flags: [] },
        itemScores: [],
        scores: [{
          key: 'total',
          type: 'total',
          label: 'Total',
          direction: 'higher_is_better',
          canonical: true,
          displayPrecision: 1,
          value: 12,
          range: { min: 0, max: 20 },
          expectedItems: ['q1'],
          answeredItems: ['q1'],
          status: 'calculated',
          prorated: false,
        }],
        references: [],
      } as unknown as ScaleResultV2,
      runtime: scaleRuntime(),
      contextHash: null,
    })
    const envelope = createCanonicalUnitResultEnvelope({
      core,
      completedAt: '2026-09-01T00:00:00.000Z',
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-tamper' },
      bundleBridge: {
        sourceResultHash: 'c'.repeat(64),
        scores: [{
          scoreKey: 'total',
          value: 12,
          status: 'calculated',
          criterionBandKey: 'who5.total.band',
        }],
      },
    })
    expect(canonicalHash(envelope.core)).toBe(envelope.resultHash)

    const tamperedBand = {
      ...envelope,
      bundleBridge: {
        ...envelope.bundleBridge!,
        scores: envelope.bundleBridge!.scores!.map((score) => ({
          ...score,
          criterionBandKey: 'tampered.band',
        })),
      },
    }
    expect(canonicalHash(tamperedBand.core)).toBe(tamperedBand.resultHash)
    expect(() => parseCanonicalUnitResultEnvelope(tamperedBand)).toThrow(/bundleBridgeHash/)

    const hashWithoutBridge = {
      ...envelope,
      bundleBridge: undefined,
    }
    expect(() => parseCanonicalUnitResultEnvelope(hashWithoutBridge)).toThrow(/without bundleBridge/)

    const bridgeWithoutHash = {
      ...envelope,
      bundleBridgeHash: undefined,
    }
    expect(() => parseCanonicalUnitResultEnvelope(bridgeWithoutHash)).toThrow(/missing bundleBridgeHash/)
  })

  it('rejects undeclared cognitive metrics and keeps trial data out of the projection', () => {
    const runtime = {
      ...scaleRuntime(),
      instrumentType: 'COGNITIVE' as const,
      instrumentKey: 'stroop',
      scorerKey: 'stroop',
      metricDefinitions: { accuracy: { key: 'accuracy', label: 'Accuracy', valueType: 'number' } },
      aggregateProjection: {
        allowedMetricKeys: ['accuracy'],
        allowedFactKeys: ['quality.status'],
        allowedReferenceClassifications: [],
      },
    }
    const snapshot = {
      schemaVersion: 1,
      completedAt: '2026-09-01T00:00:00.000Z',
      testType: 'stroop',
      configVersion: '1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      protocolSignature: 'protocol',
      profile: 'standard',
      metrics: { accuracy: 0.9 },
      quality: { state: 'interpretable', flags: {}, reasons: [] },
      references: [],
      report: {},
      assessmentContext: null,
    } as CognitiveResultSnapshot
    const resolvedConfigHash = 'a'.repeat(64)
    const core = projectCognitiveCanonicalUnitResult({ snapshot, runtime, contextHash: null, resolvedConfigHash })
    expect(core.metrics).toEqual([{ key: 'accuracy', value: 0.9 }])
    expect(core.scientificProvenance).toMatchObject({ resolvedConfigHash })
    expect(JSON.stringify(core)).not.toContain('trial')
    expect(() => projectCognitiveCanonicalUnitResult({ snapshot, runtime, contextHash: null, resolvedConfigHash: 'invalid' }))
      .toThrow(/resolved config hash/)
    expect(() => projectCognitiveCanonicalUnitResult({
      snapshot: { ...snapshot, metrics: { rawTrialResponse: 'secret' } },
      runtime,
      contextHash: null,
      resolvedConfigHash,
    })).toThrow(/not declared/)
    expect(() => projectCognitiveCanonicalUnitResult({
      snapshot: {
        ...snapshot,
        references: [{
          referenceVersion: 'norms-1',
          referenceKind: 'undeclared-classification',
          status: 'available',
          value: 1,
          z: null,
          percentile: null,
        }],
      },
      runtime,
      contextHash: null,
      resolvedConfigHash,
    })).toThrow(/not declared/)
  })

  it('stores only report-safe form collection facts', () => {
    const facts = createFormSectionCollectionFacts({
      sectionKey: 'demographics',
      items: [{ key: 'grade', label: 'Grade', value: '5' }, { key: 'tags', label: 'Tags', value: ['a', 'b'] }],
    })
    expect(parseFormSectionCollectionFacts(facts)).toEqual(facts)
    expect(JSON.stringify(facts)).not.toContain('encrypted')
    expect(() => parseFormSectionCollectionFacts({
      ...facts,
      items: [{ key: 'grade', label: 'Grade', value: [1] }],
    })).toThrow(/Malformed/)
  })
})

describe('V32-1 Cognitive trial normalizer', () => {
  it('parses each trial envelope and payload through one normalization boundary', () => {
    const definition = {
      trialSchema: z.object({ answer: z.string() }).strict(),
    } as unknown as TaskDefinition<Record<string, unknown>, { answer: string }>
    const values = [0, 1].map((trialIndex) => ({
      schemaVersion: 1,
      trialIndex,
      phase: 'test',
      startedAtPerfMs: trialIndex * 10,
      endedAtPerfMs: trialIndex * 10 + 5,
      durationMs: 5,
      flags: { timeout: false, premature: false },
      qualityEvents: [],
      payload: { answer: `answer-${trialIndex}` },
    }))

    const normalized = validateAndNormalizeTrials({ definition, values })
    expect(normalized.map((trial) => trial.payload.answer)).toEqual(['answer-0', 'answer-1'])
    expect(() => validateAndNormalizeTrials({ definition, values: [] })).toThrow(/outside/)
    expect(() => validateAndNormalizeTrials({
      definition,
      values: [{ ...values[0], payload: { answer: 1 } }],
    })).toThrow()
  })
})
