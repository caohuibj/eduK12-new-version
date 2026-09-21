import { describe, it, expect } from 'vitest'
import {
  evaluateScopedCognitiveQualification,
  type CognitiveGovernanceV1,
} from '../../modules/cognitive/onboarding/governance'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')!
function governance(): CognitiveGovernanceV1 {
  const identity = {
    testType: 'reaction',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
  }
  const scope = {
    profiles: ['standard' as const],
    protocolSignature: computeProtocolSignature(definition.protocol),
    stimulusVersion: 'none',
    populationScope: 'adults-research-cohort',
  }
  return {
    ...identity,
    schemaVersion: 1,
    declaredMaturity: 'RESEARCH_GRADE',
    claimScope: scope,
    protocolApplicability:
      'Reviewed exact standard protocol; no claims for children or shortened versions.',
    knownLimitations: ['No pediatric calibration'],
    evidence: [
      'RESEARCH_FOUNDATION',
      'PROVENANCE',
      'EMPIRICAL_REFERENCE',
      'FORMAL_OUTPUT',
    ].map((kind) => ({
      kind: kind as CognitiveGovernanceV1['evidence'][number]['kind'],
      reference: 'local-review-record',
      identity: { ...identity },
      scope: structuredClone(scope),
    })),
  }
}
describe('exact-scope scientific qualification', () => {
  it('reuses cross-family tiers without changing the declaration', () => {
    const g = governance()
    expect(
      evaluateScopedCognitiveQualification(definition, g, 'none')
        .maxEligibleMaturity,
    ).toBe('RESEARCH_GRADE')
    expect(g.declaredMaturity).toBe('RESEARCH_GRADE')
  })
  it.each(['testType', 'engineVersion', 'scoringVersion'])(
    'does not inherit evidence across %s',
    (key) => {
      const g = governance()
      for (const e of g.evidence) (e.identity as any)[key] = 'other'
      expect(
        evaluateScopedCognitiveQualification(definition, g, 'none')
          .maxEligibleMaturity,
      ).toBe('PILOT')
    },
  )
  it.each([
    'protocolSignature',
    'stimulusVersion',
    'populationScope',
    'profiles',
  ])('rejects mismatched evidence %s', (key) => {
    const g = governance()
    for (const e of g.evidence)
      (e.scope as any)[key] =
        key === 'profiles'
          ? ['research']
          : key === 'protocolSignature'
            ? '0'.repeat(64)
            : 'other'
    expect(
      evaluateScopedCognitiveQualification(definition, g, 'none')
        .maxEligibleMaturity,
    ).toBe('PILOT')
  })
  it.each([undefined, 'different'])(
    'requires independently resolved stimulus version %s',
    (version) =>
      expect(
        evaluateScopedCognitiveQualification(definition, governance(), version)
          .maxEligibleMaturity,
      ).toBe('PILOT'),
  )
  it('requires protocol applicability and rejects unknown schema versions', () => {
    const g = governance()
    g.protocolApplicability = ''
    expect(
      evaluateScopedCognitiveQualification(definition, g, 'none')
        .maxEligibleMaturity,
    ).toBe('PILOT')
    expect(() =>
      evaluateScopedCognitiveQualification(
        definition,
        { ...g, schemaVersion: 2 } as never,
        'none',
      ),
    ).toThrow()
  })
})
