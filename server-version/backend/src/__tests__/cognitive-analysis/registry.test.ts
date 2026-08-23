import { describe, expect, it } from 'vitest'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import {
  getAnalysisProtocolDefinition,
  listAnalysisProtocolCatalog,
  listAnalysisProtocolDefinitions,
  listCognitiveDomainDefinitions,
  listCognitiveEvidenceMappings,
  validateAnalysisProtocolDefinitions,
  validateCognitiveEvidenceMappings,
  validateDomainDefinitions,
} from '../../modules/cognitive-analysis'

describe('Round 2 cognitive analysis registries', () => {
  it('registers ten unique supported domains and rejects duplicate definitions', () => {
    const domains = listCognitiveDomainDefinitions()
    expect(domains).toHaveLength(10)
    expect(new Set(domains.map((domain) => domain.key)).size).toBe(10)
    expect(() => validateDomainDefinitions([domains[0], domains[0]])).toThrow(/Duplicate cognitive domain/)
  })

  it('maps only real frozen task metric keys and never owns one primary metric from two domains', () => {
    const mappings = listCognitiveEvidenceMappings()
    const entries = listCognitiveRegistryEntries()
    const primaryOwners = new Map<string, string>()

    for (const mapping of mappings) {
      const entry = entries.find(
        (candidate) =>
          candidate.testType === mapping.testType &&
          candidate.engineVersion === mapping.engineVersion &&
          candidate.scoringVersion === mapping.scoringVersion,
      )
      expect(entry, mapping.testType).toBeTruthy()
      expect(entry?.metricDefinitionVersion).toBe(mapping.metricDefinitionVersion)
      expect(entry?.metricDefinitions[mapping.metricKey]).toBeTruthy()

      if (mapping.role === 'primary') {
        const sourceKey = [
          mapping.testType,
          mapping.engineVersion,
          mapping.scoringVersion,
          mapping.metricDefinitionVersion,
          mapping.metricKey,
        ].join('/')
        const owner = primaryOwners.get(sourceKey)
        expect(owner === undefined || owner === mapping.domain).toBe(true)
        primaryOwners.set(sourceKey, mapping.domain)
      }
    }
  })

  it('rejects unknown metrics and cross-domain primary double counting', () => {
    const mappings = listCognitiveEvidenceMappings()
    expect(() =>
      validateCognitiveEvidenceMappings([
        ...mappings,
        { ...mappings[0], metricKey: 'notARealMetric' },
      ]),
    ).toThrow(/Unknown cognitive evidence metric/)

    expect(() =>
      validateCognitiveEvidenceMappings([
        mappings[0],
        {
          ...mappings[0],
          domain: 'sustained_attention',
          facet: 'response_stability',
        },
      ]),
    ).toThrow(/primary metric mapped to multiple domains/)
  })

  it('registers six exact DRAFT protocols and hides them from the create catalog', () => {
    const protocols = listAnalysisProtocolDefinitions()
    expect(protocols).toHaveLength(6)
    expect(new Set(protocols.map((protocol) => `${protocol.key}/${protocol.version}`)).size).toBe(6)
    expect(protocols.every((protocol) => protocol.status === 'DRAFT')).toBe(true)
    expect(protocols.every((protocol) => protocol.recommendedForCreate === false)).toBe(true)
    expect(protocols.every((protocol) => protocol.profiles.join(',') === 'standard,research')).toBe(true)
    expect(listAnalysisProtocolCatalog().list).toEqual([])
    expect(listAnalysisProtocolCatalog(true).list).toHaveLength(6)
  })

  it('pins exact versions and keeps the comprehensive K12 protocol non-configurable', () => {
    const protocol = getAnalysisProtocolDefinition('k12_core_profile_v1', '1.0.0')
    expect(protocol?.cognitiveSlots).toHaveLength(10)
    expect(protocol?.cognitiveSlots.map((slot) => slot.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(protocol?.cognitiveSlots.every((slot) => slot.required)).toBe(true)
    expect(protocol?.cognitiveSlots.find((slot) => slot.testType === 'cpt')).toMatchObject({
      configVersion: '1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
  })

  it('does not let catalog callers mutate static registry definitions', () => {
    const protocol = getAnalysisProtocolDefinition('attention_stability_v1', '1.0.0')
    expect(protocol).toBeTruthy()
    protocol?.profiles.splice(0, protocol.profiles.length)
    if (protocol) protocol.cognitiveSlots[0].label = 'mutated'

    const reloaded = getAnalysisProtocolDefinition('attention_stability_v1', '1.0.0')
    expect(reloaded?.profiles).toEqual(['standard', 'research'])
    expect(reloaded?.cognitiveSlots[0].label).toBe('简单反应')

    const domains = listCognitiveDomainDefinitions()
    domains[0].facets[0].label = 'mutated'
    expect(listCognitiveDomainDefinitions()[0].facets[0].label).toBe('简单反应')
  })

  it('rejects duplicate slots and PUBLISHED protocols with unresolved task versions', () => {
    const base = listAnalysisProtocolDefinitions()[0]
    expect(() =>
      validateAnalysisProtocolDefinitions([
        {
          ...base,
          cognitiveSlots: [base.cognitiveSlots[0], base.cognitiveSlots[0]],
        },
      ]),
    ).toThrow(/Duplicate analysis protocol slot key/)

    expect(() =>
      validateAnalysisProtocolDefinitions([
        { ...base, status: 'PUBLISHED', recommendedForCreate: true },
      ]),
    ).toThrow(/unresolved task: attention_stability_v1\/1.0.0\/patterncompare/)
  })
})
