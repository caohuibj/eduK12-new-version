import { describe, expect, it } from 'vitest'
import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from '../../modules/situational/onboarding/instruments.generated'
import { instrumentSourceSchema, projectSituationPackage, publicationContentDigest } from '../../modules/situational/onboarding/schema'
import { scientificSchema } from '../../modules/situational/onboarding/scientific-schema'
import { createSituationalScientificRegistry } from '../../modules/situational/onboarding/scientific-registry'
import { evaluateScopedSituationalQualification, situationalExecutionRef } from '../../modules/situational/onboarding/scientific-qualification'
import { compileSituationRuntime } from '../../modules/assessment-runtime/compiler'

const source = () => instrumentSourceSchema.parse(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES[0])
const withEvidence = () => {
  const s = source()
  const scope = { language: 'zh-CN', population: 'adult volunteers', use: 'research', claim: 'task construct association' }
  s.scientific.claimScope = scope
  s.scientific.evidence = (['RESEARCH_FOUNDATION', 'PROVENANCE', 'EMPIRICAL_REFERENCE', 'FORMAL_OUTPUT'] as const).map(kind => ({
    id: kind, kind, reference: `protocol:${kind}`, executionRef: situationalExecutionRef(projectSituationPackage(s)), scope: { ...scope }, reviewReference: 'review:fixture-only',
  }))
  return s
}

describe('instrument-owned SJT scientific evidence', () => {
  it('isolates exact identities and owns its data without a mutable override map', () => {
    const input = source()
    const registry = createSituationalScientificRegistry([input])
    input.scientific.governanceRevision = 90
    const { instrumentKey: key, instrumentVersion: version } = input.content.identity
    expect(registry.get(key, version)?.governanceRevision).toBe(2)
    const result = registry.get(key, version)!
    result.governanceRevision = 99
    expect(registry.get(key, version)?.governanceRevision).toBe(2)
    expect(registry.get(key, '2.0.0')).toBeUndefined()
    expect(() => createSituationalScientificRegistry([input, input])).toThrow('Duplicate')
  })

  it('allows evidence eligibility on a draft without promoting or publishing it', () => {
    const s = withEvidence()
    s.publication = { releaseStatus: 'DRAFT' }
    const q = evaluateScopedSituationalQualification(projectSituationPackage(s), s.scientific)
    expect(q.maxEligibleMaturity).toBe('RESEARCH_GRADE')
    expect(q.declaredMaturity).toBe('PILOT')
    expect(q.applicableEvidenceIds).toHaveLength(4)
    expect(s.publication.releaseStatus).toBe('DRAFT')
  })

  it.each(['instrumentKey', 'instrumentVersion', 'scorerKey', 'scoringVersion', 'definitionHash'] as const)('excludes evidence bound to another %s', field => {
    const s = withEvidence()
    for (const e of s.scientific.evidence) e.executionRef[field] = field === 'definitionHash' ? '0'.repeat(64) : 'other'
    const q = evaluateScopedSituationalQualification(projectSituationPackage(s), s.scientific)
    expect(q.maxEligibleMaturity).toBe('PILOT')
    expect(q.excludedEvidenceIds).toHaveLength(4)
  })

  it.each(['language', 'population', 'use', 'claim'] as const)('does not reuse evidence from a different %s', field => {
    const s = withEvidence()
    s.scientific.claimScope![field] = 'different scope'
    expect(evaluateScopedSituationalQualification(projectSituationPackage(s), s.scientific).maxEligibleMaturity).toBe('PILOT')
  })

  it('rejects duplicate references and keeps advanced declarations closed until review enforcement', () => {
    const s = withEvidence()
    s.scientific.evidence.push(s.scientific.evidence[0])
    expect(() => scientificSchema.parse(s.scientific)).toThrow('Duplicate evidence id')
    expect(() => scientificSchema.parse({ ...source().scientific, scientificMaturity: 'RESEARCH_READY' })).toThrow()
  })

  it('keeps publication digests and compiled execution unchanged by scientific evidence', () => {
    const before = source(), after = withEvidence()
    after.scientific.governanceRevision = 3
    expect(publicationContentDigest(before.content)).toBe(publicationContentDigest(after.content))
    const compile = (s: ReturnType<typeof source>) => compileSituationRuntime({ ...s.content.identity, definition: s.content.definition })
    expect(compile(after)).toEqual(compile(before))
  })
})
