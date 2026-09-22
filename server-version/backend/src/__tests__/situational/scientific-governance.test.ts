import { evaluateSituationalScientificGovernance, scientificRevisionIssues, scientificEvidenceDigest } from '../../modules/situational/onboarding/scientific-governance'
import { verifyGitHubScientificReview } from '../../modules/situational/onboarding/review-authority'
import { declareScience } from './fixtures/scientific-source'
import { freezeSituationalRuntimeAtAttemptStart, parseFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { frozenSituationalScientificProjection } from '../../modules/situational/onboarding/scientific-schema'
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

  it('rejects duplicate references and rejects unreviewed advanced declarations', () => {
    const s = withEvidence()
    s.scientific.evidence.push(s.scientific.evidence[0])
    expect(() => scientificSchema.parse(s.scientific)).toThrow('Duplicate evidence id')
    const advanced = source()
    advanced.scientific.scientificMaturity = 'RESEARCH_READY'
    expect(evaluateSituationalScientificGovernance(advanced).errors).toContain('SCIENTIFIC_REVIEW_REQUIRED')
  })

  it('keeps publication digests and compiled execution unchanged by scientific evidence', () => {
    const before = source(), after = withEvidence()
    after.scientific.governanceRevision = 3
    expect(publicationContentDigest(before.content)).toBe(publicationContentDigest(after.content))
    const compile = (s: ReturnType<typeof source>) => compileSituationRuntime({ ...s.content.identity, definition: s.content.definition })
    expect(compile(after)).toEqual(compile(before))
  })
})

describe('scientific review and historical integrity', () => {
  it.each(['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE'] as const)('validates explicitly declared %s without changing executable publication', tier => {
    const s = declareScience(source(), tier)
    expect(evaluateSituationalScientificGovernance(s).valid).toBe(true)
    expect(publicationContentDigest(s.content)).toBe(publicationContentDigest(source().content))
  })
  it.each(['RESEARCH_FOUNDATION', 'EMPIRICAL_REFERENCE', 'FORMAL_OUTPUT'] as const)('rejects Grade missing %s', kind => {
    const s = declareScience(source(), 'RESEARCH_GRADE')
    s.scientific.evidence = s.scientific.evidence.filter(e => e.kind !== kind)
    expect(evaluateSituationalScientificGovernance(s).errors).toContain('SCIENTIFIC_OVERCLAIM')
  })
  it('rejects Ready without provenance even when foundation is present', () => {
    const s = declareScience(source(), 'RESEARCH_READY')
    s.content.definition.source = {}
    s.content.definition.license.status = 'unknown'
    s.scientific.evidence = s.scientific.evidence.filter(e => e.kind !== 'PROVENANCE')
    expect(evaluateSituationalScientificGovernance(s).valid).toBe(false)
  })
  it('rejects stale evidence, targets and scope bindings and requires revision/reason on withdrawal', () => {
    const s = declareScience(source(), 'RESEARCH_GRADE')
    const changed = structuredClone(s)
    changed.scientific.evidence[0]!.reference = 'amended-protocol'
    expect(evaluateSituationalScientificGovernance(changed).errors).toContain('SCIENTIFIC_REVIEW_STALE')
    changed.scientific = { ...s.scientific, scientificMaturity: 'RESEARCH_READY' }
    expect(evaluateSituationalScientificGovernance(changed).errors).toContain('SCIENTIFIC_REVIEW_STALE')
    const withdrawn = declareScience(structuredClone(s), 'PILOT', 4)
    withdrawn.scientific.evidence = []
    expect(scientificRevisionIssues([s], [withdrawn])).toEqual([])
    withdrawn.scientific.governanceRevision = 3
    delete withdrawn.scientific.changeReason
    expect(scientificRevisionIssues([s], [withdrawn])).toHaveLength(2)
  })
  const approval = { id: 123, state: 'APPROVED', user: { login: 'independent-reviewer', type: 'User' }, submitted_at: '2026-09-21T00:00:00.000Z', commit_id: 'a'.repeat(40) }
  const github = (override: Record<string, unknown> = {}, permission = 'write', later: unknown[] = []) => async (route: string) => {
    if (route.endsWith('/permission')) return { permission }
    if (route.includes('?')) return later
    if (route.endsWith('/reviews/123')) return { ...approval, ...override }
    return { user: { login: 'author' }, base: { repo: { full_name: 'caohuibj/eduK12-new-version' } } }
  }
  it('verifies an independent authorized approval against exact reviewed content', async () => {
    const s = declareScience(source(), 'RESEARCH_GRADE')
    const read = (_sha: string, path: string) => path.endsWith('/instrument.json') ? s.content : { ...s.scientific, review: undefined }
    await expect(verifyGitHubScientificReview(s, github(), read)).resolves.toBeUndefined()
    for (const get of [github({ state: 'DISMISSED' }), github({ user: { login: 'author', type: 'User' } }), github({}, 'read'), github({}, 'write', [{ ...approval, id: 124, state: 'CHANGES_REQUESTED' }]), github({ submitted_at: '2026-09-22T00:00:00Z' })]) {
      await expect(verifyGitHubScientificReview(s, get, read)).rejects.toThrow()
    }
    await expect(verifyGitHubScientificReview(s, github(), (_sha, path) => path.endsWith('/instrument.json') ? s.content : { ...s.scientific, knownLimitations: ['changed'] })).rejects.toThrow('does not cover')
  })
  it('authenticates scientific snapshots separately from unchanged execution hashes and preserves legacy parsing', () => {
    const pkg = projectSituationPackage(source())
    const freeze = (tier: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE') => {
      const s = declareScience(source(), tier)
      return freezeSituationalRuntimeAtAttemptStart({ ...s.content.identity, definition: pkg.definition, frozenAt: new Date(0), scientificContext: { schemaVersion: 1, scientificMaturity: tier, governanceRevision: 3, scope: s.scientific.claimScope, executionRef: situationalExecutionRef(pkg), evidenceDigest: scientificEvidenceDigest(s.scientific) } })
    }
    const pilot = freeze('PILOT')
    for (const tier of ['RESEARCH_READY', 'RESEARCH_GRADE'] as const) {
      const advanced = freeze(tier)
      expect(advanced.definitionHash).toBe(pilot.definitionHash)
      expect(advanced.compiledRuntime).toEqual(pilot.compiledRuntime)
      expect(advanced.runnerDefinition).toEqual(pilot.runnerDefinition)
      expect(advanced.snapshotHash).not.toBe(pilot.snapshotHash)
      expect(parseFrozenSituationalRuntimeSnapshot(advanced).scientificContext?.scientificMaturity).toBe(tier)
    }
    const tampered = structuredClone(pilot)
    tampered.scientificContext!.scientificMaturity = 'RESEARCH_GRADE'
    expect(() => parseFrozenSituationalRuntimeSnapshot(tampered)).toThrow('snapshot hash mismatch')
    const legacy = freezeSituationalRuntimeAtAttemptStart({ ...source().content.identity, definition: pkg.definition, frozenAt: new Date(0) })
    expect(parseFrozenSituationalRuntimeSnapshot(legacy)).toEqual(legacy)
    expect(frozenSituationalScientificProjection(legacy.scientificContext)).toMatchObject({ scientificMaturity: 'PILOT', provenance: 'LEGACY_MISSING', governanceRevision: null })
  })
})

it('classifies governance-only changes without granting them executable-content permission', async () => {
  const { classifySituationalChange } = await import('../../modules/situational/onboarding/path-policy')
  const root = 'server-version/backend/src/modules/situational/instruments/example/1.0.0/'
  expect(classifySituationalChange(root + 'scientific.json')).toBe('SCIENTIFIC_GOVERNANCE')
  expect(classifySituationalChange(root + 'publication.json')).toBe('PUBLICATION')
  expect(classifySituationalChange(root + 'instrument.json')).toBe('EXECUTABLE_CONTENT')
  expect(classifySituationalChange(root + 'test.ts')).toBe('SHARED_CORE')
})
