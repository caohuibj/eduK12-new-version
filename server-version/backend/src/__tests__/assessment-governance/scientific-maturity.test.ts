import { afterEach, describe, expect, it } from 'vitest'
import {
  SCIENTIFIC_MATURITY_LEVELS,
  emptyResearchPlan,
} from '../../modules/assessment-governance/scientific-maturity'
import { scientificMaturitySchema } from '../../modules/scale/library/catalog-manifest'
import {
  RESEARCH_READY_IDENTITIES,
  resolveCognitiveScientificMaturity,
} from '../../modules/cognitive/library/scientific-maturity'
import {
  SITUATIONAL_SCIENTIFIC_MATURITY_BY_IDENTITY,
  resolveSituationalScientificMaturity,
} from '../../modules/situational/scientific-maturity'
import { getSituationalInstrument } from '../../modules/situational/situational-runtime.service'
import {
  createBundleScientificMaturityRegistry,
  resolveBundleScientificMaturity,
} from '../../modules/assessment-bundle/scientific-maturity'

const COGNITIVE_IDENTITY = 'reaction/1.0.0/1.1.0'
const SITUATIONAL_IDENTITY = 'sjt-assertiveness-golden@1.0.0'

afterEach(() => {
  RESEARCH_READY_IDENTITIES.delete(COGNITIVE_IDENTITY)
  SITUATIONAL_SCIENTIFIC_MATURITY_BY_IDENTITY.delete(SITUATIONAL_IDENTITY)
})

describe('scientific maturity governance', () => {
  it('uses one cross-family maturity vocabulary with Research Ready between Pilot and future Research Grade', () => {
    expect(SCIENTIFIC_MATURITY_LEVELS).toEqual(['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE'])
    expect(scientificMaturitySchema.parse('RESEARCH_READY')).toBe('RESEARCH_READY')
  })

  it('keeps cognitive maturity exact-identity scoped and defaults unreviewed identities to Pilot', () => {
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('PILOT')
    RESEARCH_READY_IDENTITIES.add(COGNITIVE_IDENTITY)
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('RESEARCH_READY')
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.0.0')).toBe('PILOT')
  })

  it('changes only situational governance metadata when an exact identity is promoted', () => {
    const pilot = getSituationalInstrument('sjt-assertiveness-golden', '1.0.0')
    expect(pilot.scienceMaturity).toBe('PILOT')

    SITUATIONAL_SCIENTIFIC_MATURITY_BY_IDENTITY.set(SITUATIONAL_IDENTITY, 'RESEARCH_READY')
    const researchReady = getSituationalInstrument('sjt-assertiveness-golden', '1.0.0')

    expect(resolveSituationalScientificMaturity('sjt-assertiveness-golden', '1.0.0')).toBe('RESEARCH_READY')
    expect(researchReady.scienceMaturity).toBe('RESEARCH_READY')
    expect(researchReady.definitionHash).toBe(pilot.definitionHash)
    expect(researchReady.compiledRuntimeHash).toBe(pilot.compiledRuntimeHash)
    expect(researchReady.scorerKey).toBe(pilot.scorerKey)
    expect(researchReady.scoringVersion).toBe(pilot.scoringVersion)
    expect(researchReady.definition).toEqual(pilot.definition)
    expect(researchReady.report).toEqual(pilot.report)
  })

  it('keeps Bundle maturity in governance metadata and defaults missing reviews to Pilot', () => {
    const identity = { bundleKey: 'learning-self-regulation-v1', bundleVersion: '1.0.0' }
    const emptyRegistry = createBundleScientificMaturityRegistry([])
    expect(resolveBundleScientificMaturity(identity, emptyRegistry)).toBe('PILOT')

    const registry = createBundleScientificMaturityRegistry([{
      schemaVersion: 1,
      ...identity,
      scientificMaturity: 'RESEARCH_READY',
      researchPlan: emptyResearchPlan(),
      evidenceRefs: ['pilot-study-2026-01'],
      reviewedAt: '2026-09-11T00:00:00.000Z',
    }])
    expect(resolveBundleScientificMaturity(identity, registry)).toBe('RESEARCH_READY')
  })
})
