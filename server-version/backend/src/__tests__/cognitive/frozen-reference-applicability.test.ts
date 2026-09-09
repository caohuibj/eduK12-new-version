import { describe, expect, it } from 'vitest'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import type { ReferenceBindingSnapshot } from '../../modules/assessment-runtime/types'
import { hashResolvedConfig } from '../../modules/cognitive/profile-freeze'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { withFrozenCognitiveReferenceApplicability } from '../../modules/cognitive/v2/frozen-reference-applicability'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import type { ReferenceApplicability, TaskDefinition } from '../../modules/cognitive/v2/types'

const baseDefinition = () => {
  const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
  if (!definition) throw new Error('reaction v1.1 definition missing')
  return definition
}

const config = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  report: { reportVersion: '1.1.0', referenceMode: 'none' as const },
}

const mapping = (profile: 'standard' | 'research' = 'standard'): ReferenceApplicability => {
  const definition = baseDefinition()
  return {
    metricKey: 'medianRtMs',
    referenceVersion: 'reaction-rutter-descriptive-v1',
    referenceKind: 'descriptive_sample',
    evidenceLevel: 'literature_beta',
    instrumentVersion: definition.engineVersion,
    scoringVersion: definition.scoringVersion,
    direction: definition.metrics.medianRtMs.direction,
    profiles: [profile],
    resolvedConfigHashes: [hashResolvedConfig(config)],
    requiredContext: ['age'],
  }
}

const definitionWith = (reference: ReferenceApplicability): TaskDefinition => ({
  ...baseDefinition(),
  references: [reference],
}) as TaskDefinition

const bindingFor = (
  reference: ReferenceApplicability,
  options: { applicability?: ReferenceApplicability | null } = { applicability: reference },
): ReferenceBindingSnapshot => ({
  referenceKey: 'reaction',
  referenceVersion: reference.referenceVersion,
  referenceHash: 'a'.repeat(64),
  scoreKey: reference.metricKey,
  referenceKind: reference.referenceKind,
  ...(options.applicability === null ? {} : {
    applicability: (options.applicability ?? reference) as unknown as NonNullable<ReferenceBindingSnapshot['applicability']>,
  }),
})

describe('Cognitive frozen reference applicability', () => {
  it('keeps a historical no-reference attempt reference-free after current registry mappings change', () => {
    const current = definitionWith(mapping('research'))
    const restored = withFrozenCognitiveReferenceApplicability(current, [])
    expect(current.references).toHaveLength(1)
    expect(restored.references).toEqual([])
  })

  it('uses the frozen applicability instead of a later current mapping', () => {
    const frozen = mapping('standard')
    const current = definitionWith(mapping('research'))
    const restored = withFrozenCognitiveReferenceApplicability(current, [bindingFor(frozen)])
    expect(restored.references).toEqual([frozen])
    expect(restored.references[0].profiles).toEqual(['standard'])
  })

  it('fails closed for a non-empty historical binding that lacks frozen applicability', () => {
    const reference = mapping('standard')
    expect(() => withFrozenCognitiveReferenceApplicability(
      definitionWith(reference),
      [bindingFor(reference, { applicability: null })],
    )).toThrow(/missing applicability/)
  })

  it('freezes exact applicability into a new unified Cognitive session snapshot', () => {
    const reference = mapping('standard')
    const definition = definitionWith(reference)
    const runtime = compileCognitiveRuntime({ definition, instrumentVersion: definition.engineVersion })
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.1.0',
      config,
      runtime: {
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntime: runtime,
        referenceBindings: [bindingFor(reference, { applicability: null })],
      },
      frozenAt: new Date('2026-09-09T00:00:00.000Z'),
    })

    expect(snapshot.referenceBindings).toHaveLength(1)
    expect(snapshot.referenceBindings?.[0].applicability).toEqual(reference)
    expect(snapshot.referenceBindings?.[0]).toMatchObject({
      referenceVersion: reference.referenceVersion,
      scoreKey: reference.metricKey,
      referenceKind: reference.referenceKind,
    })
  })

  it('rejects a binding when its frozen applicability identity is tampered', () => {
    const reference = mapping('standard')
    const tampered = { ...reference, referenceVersion: 'other-version' }
    expect(() => withFrozenCognitiveReferenceApplicability(
      definitionWith(reference),
      [bindingFor(reference, { applicability: tampered })],
    )).toThrow(/identity mismatch/)
  })
})
