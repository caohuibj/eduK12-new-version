import { afterEach, describe, expect, it } from 'vitest'
import {
  SCIENTIFIC_MATURITY_LEVELS,
  emptyResearchPlan,
} from '../../modules/assessment-governance/scientific-maturity'
import { scientificMaturitySchema } from '../../modules/scale/library/catalog-manifest'
import {
  COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY,
  RESEARCH_READY_IDENTITIES,
  resolveCognitiveScientificMaturity,
} from '../../modules/cognitive/library/scientific-maturity'
import { RESEARCH_GRADE_IDENTITIES as CATALOG_RESEARCH_GRADE_IDENTITIES } from '../../modules/cognitive/library/catalog'
import {
  resolveSituationalScientificMaturity,
} from '../../modules/situational/scientific-maturity'
import { getSituationalInstrument } from '../../modules/situational/situational-runtime.service'
import {
  createBundleScientificMaturityRegistry,
  resolveBundleScientificMaturity,
} from '../../modules/assessment-bundle/scientific-maturity'

const COGNITIVE_IDENTITY = 'reaction/1.0.0/1.1.0'

afterEach(() => {
  COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.clear()
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

  it('routes legacy Cognitive maturity views through one authoritative identity map', () => {
    RESEARCH_READY_IDENTITIES.add(COGNITIVE_IDENTITY)
    expect(COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.get(COGNITIVE_IDENTITY)).toBe('RESEARCH_READY')
    expect(CATALOG_RESEARCH_GRADE_IDENTITIES.has(COGNITIVE_IDENTITY)).toBe(false)

    CATALOG_RESEARCH_GRADE_IDENTITIES.add(COGNITIVE_IDENTITY)
    expect(COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.get(COGNITIVE_IDENTITY)).toBe('RESEARCH_GRADE')
    expect(RESEARCH_READY_IDENTITIES.has(COGNITIVE_IDENTITY)).toBe(false)
    expect(resolveCognitiveScientificMaturity('reaction', '1.0.0', '1.1.0')).toBe('RESEARCH_GRADE')
  })

  it('resolves current SJT maturity from its owned declaration and rejects unknown versions', () => {
    const instrument = getSituationalInstrument('sjt-assertiveness-golden', '1.0.0')
    expect(instrument.scienceMaturity).toBe('PILOT')
    expect(resolveSituationalScientificMaturity('sjt-assertiveness-golden', '1.0.0')).toBe('PILOT')
    expect(() => resolveSituationalScientificMaturity('sjt-assertiveness-golden', '9.0.0')).toThrow('Unknown situational scientific identity')
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
