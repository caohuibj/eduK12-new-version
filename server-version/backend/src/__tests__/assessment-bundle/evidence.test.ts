import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  buildBundleContextFacts,
  validateEvidenceItem,
  validateEvidenceSource,
} from '../../modules/assessment-bundle/evidence'
import type { EvidenceSourceV1, MentalHealthRuleBindingV1 } from '../../modules/assessment-bundle/types'
import { HASH_A, HASH_B, scaleEvidenceItem } from './fixtures'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

describe('EvidenceItemV1', () => {
  it('accepts discriminated sources and forbids mixed keys', () => {
    expect(validateEvidenceSource({
      kind: 'COGNITIVE_METRIC',
      slotKey: 'gonogo',
      metricKey: 'commissionRate',
      sourceResultHash: HASH_A,
    }).kind).toBe('COGNITIVE_METRIC')
    expect(validateEvidenceItem(scaleEvidenceItem()).role).toBe('PRIMARY')
    expect(failCode(() => validateEvidenceSource({
      kind: 'SCALE_SCORE',
      slotKey: 'sdq',
      scoreKey: 'total',
      metricKey: 'commissionRate',
      sourceResultHash: HASH_A,
    } as EvidenceSourceV1))).toBe('EVIDENCE_SOURCE_SHAPE')
    expect(failCode(() => validateEvidenceSource({
      kind: 'COGNITIVE_METRIC',
      slotKey: 'gonogo',
      metricKey: 'commissionRate',
      scoreKey: 'total',
      sourceResultHash: HASH_A,
    } as EvidenceSourceV1))).toBe('EVIDENCE_SOURCE_SHAPE')
    expect(failCode(() => validateEvidenceSource({
      kind: 'CONTEXT_FACT',
      contextKey: 'sleep',
      contextSnapshotHash: HASH_B,
      scoreKey: 'total',
    } as EvidenceSourceV1))).toBe('EVIDENCE_SOURCE_SHAPE')
  })

  it('keeps FACET off EvidenceItem.role and on the mental-health rule binding', () => {
    expect(failCode(() => validateEvidenceItem({
      ...scaleEvidenceItem(),
      role: 'FACET' as 'PRIMARY',
    }))).toBe('EVIDENCE_SOURCE_SHAPE')
    const binding: MentalHealthRuleBindingV1 = { evidenceKey: 'sdq.total.primary', tier: 'FACET' }
    expect(binding.tier).toBe('FACET')
  })

  it('hashes context facts without inventing missing values', () => {
    const facts = buildBundleContextFacts({
      contextDefinitionKey: 'bundle-context-v1',
      contextDefinitionVersion: '1.0.0',
      contextDefinitionHash: HASH_A,
      facts: [
        { contextKey: 'grade', value: { state: 'present', value: '8' } },
        { contextKey: 'sleep_hours', value: { state: 'missing' } },
      ],
    })
    expect(facts.contextSnapshotHash).toMatch(/^[0-9a-f]{64}$/)
    expect(facts.facts[1].value.state).toBe('missing')
  })
})
