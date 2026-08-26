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

const EXPECTED_MAPPING_TUPLES = [
  'reaction/1.0.0/1.1.0/1.1.0/medianRtMs/processing_speed/simple_response/primary',
  'patterncompare/1.0.0/1.0.0/1.0.0/correctPerMinute/processing_speed/visual_comparison/primary',
  'patterncompare/1.0.0/1.0.0/1.0.0/medianCorrectRtMs/processing_speed/visual_comparison/primary',
  'cpt/1.0.0/1.0.0/1.0.0/hitMedianRtMs/processing_speed/simple_response/supporting',
  'reaction/1.0.0/1.1.0/1.1.0/rtICV/sustained_attention/response_stability/supporting',
  'reaction/1.0.0/1.1.0/1.1.0/missRate/sustained_attention/omission_control/supporting',
  'cpt/1.0.0/1.0.0/1.0.0/dPrime/sustained_attention/target_discrimination/primary',
  'cpt/1.0.0/1.0.0/1.0.0/omissionRate/sustained_attention/omission_control/primary',
  'cpt/1.0.0/1.0.0/1.0.0/rtICV/sustained_attention/response_stability/primary',
  'cpt/1.0.0/1.0.0/1.0.0/commissionRate/response_inhibition/action_withholding/supporting',
  'gonogo/1.0.0/1.0.0/1.0.0/commissionRate/response_inhibition/action_withholding/primary',
  'gonogo/1.0.0/1.0.0/1.0.0/dPrime/response_inhibition/action_withholding/primary',
  'sst/1.0.0/1.0.0/1.0.0/ssrtMs/response_inhibition/action_cancellation/primary',
  'sst/1.0.0/1.0.0/1.0.0/pRespondStop/response_inhibition/action_cancellation/primary',
  'stroop/1.0.0/1.1.0/1.1.0/stroopEffectMs/interference_control/semantic_interference/primary',
  'stroop/1.0.0/1.1.0/1.1.0/incongruentAccuracy/interference_control/semantic_interference/primary',
  'flanker/1.0.0/1.0.0/1.0.0/flankerEffectMs/interference_control/perceptual_interference/primary',
  'flanker/1.0.0/1.0.0/1.0.0/incongruentAccuracy/interference_control/perceptual_interference/primary',
  'stroop/1.0.0/1.1.0/1.1.0/errorCost/interference_control/semantic_interference/supporting',
  'flanker/1.0.0/1.0.0/1.0.0/errorCost/interference_control/perceptual_interference/supporting',
  'memory/1.0.0/1.1.0/1.1.0/maxSpan/working_memory/verbal_storage/primary',
  'memory/1.0.0/1.1.0/1.1.0/totalCorrectTrials/working_memory/verbal_storage/primary',
  'digitbackward/1.0.0/1.0.0/1.0.0/maxSpan/working_memory/verbal_manipulation/primary',
  'digitbackward/1.0.0/1.0.0/1.0.0/totalCorrectTrials/working_memory/verbal_manipulation/primary',
  'digitbackward/1.0.0/1.0.0/1.0.0/sequenceDistance/working_memory/verbal_manipulation/supporting',
  'corsi/1.0.0/1.0.0/1.0.0/maxSpan/working_memory/visuospatial_storage/primary',
  'corsi/1.0.0/1.0.0/1.0.0/totalCorrectTrials/working_memory/visuospatial_storage/primary',
  'corsi/1.0.0/1.0.0/1.0.0/sequenceErrorDistance/working_memory/visuospatial_storage/supporting',
  'nback/1.0.0/1.0.0/1.0.0/dPrimeByN/working_memory/updating/primary',
  'nback/1.0.0/1.0.0/1.0.0/maxReliableN/working_memory/updating/primary',
  'nback/1.0.0/1.0.0/1.0.0/loadCostDPrime/working_memory/updating/supporting',
  'taskswitch/1.0.0/1.0.0/1.0.0/switchCostRtMs/cognitive_flexibility/trial_switching/primary',
  'taskswitch/1.0.0/1.0.0/1.0.0/switchCostAccuracy/cognitive_flexibility/trial_switching/primary',
  'cardsort/1.0.0/1.0.0/1.0.0/switchCostRtMs/cognitive_flexibility/rule_shifting/primary',
  'cardsort/1.0.0/1.0.0/1.0.0/perseverativeErrorRate/cognitive_flexibility/rule_shifting/primary',
  'cardsort/1.0.0/1.0.0/1.0.0/postSwitchRecovery/cognitive_flexibility/rule_shifting/supporting',
  'picturesequence/1.0.0/1.0.0/1.0.0/adjacentPairScore/episodic_learning_memory/sequence_learning/primary',
  'picturesequence/1.0.0/1.0.0/1.0.0/learningGain/episodic_learning_memory/sequence_learning/primary',
  'picturesequence/1.0.0/1.0.0/1.0.0/delayedRetention/episodic_learning_memory/sequence_learning/supporting',
  'pairedassociate/1.0.0/1.0.0/1.0.0/learningSlope/episodic_learning_memory/paired_learning/primary',
  'pairedassociate/1.0.0/1.0.0/1.0.0/trialsToCriterion/episodic_learning_memory/paired_learning/primary',
  'pairedassociate/1.0.0/1.0.0/1.0.0/delayedAccuracy/episodic_learning_memory/paired_learning/supporting',
  'matrix/1.0.0/1.0.0/1.0.0/accuracy/fluid_reasoning/rule_induction/primary',
  'matrix/1.0.0/1.0.0/1.0.0/accuracyByRuleFamily/fluid_reasoning/rule_induction/primary',
  'matrix/1.0.0/1.0.0/1.0.0/reachedDifficulty/fluid_reasoning/rule_induction/supporting',
  'matrix/1.0.0/1.0.0/1.0.0/medianRtMs/fluid_reasoning/rule_induction/supporting',
  'mentalrotation/1.0.0/1.0.0/1.0.0/accuracy/visuospatial_reasoning/mental_rotation/primary',
  'mentalrotation/1.0.0/1.0.0/1.0.0/angleCost/visuospatial_reasoning/mental_rotation/primary',
  'mentalrotation/1.0.0/1.0.0/1.0.0/medianCorrectRtMs/visuospatial_reasoning/mental_rotation/supporting',
  'tower/1.0.0/1.0.0/1.0.0/minimumMoveSolveRate/planning/look_ahead/primary',
  'tower/1.0.0/1.0.0/1.0.0/excessMoves/planning/look_ahead/primary',
  'tower/1.0.0/1.0.0/1.0.0/firstMoveLatencyMs/planning/look_ahead/supporting',
  'tower/1.0.0/1.0.0/1.0.0/ruleViolations/planning/look_ahead/supporting',
]

describe('Round 2 cognitive analysis registries', () => {
  it('registers ten unique supported domains and rejects duplicate definitions', () => {
    const domains = listCognitiveDomainDefinitions()
    expect(domains).toHaveLength(10)
    expect(new Set(domains.map((domain) => domain.key)).size).toBe(10)
    expect(listCognitiveDomainDefinitions('1.0.0')).toEqual(domains)
    expect(listCognitiveDomainDefinitions('9.9.9')).toEqual([])
    expect(() => validateDomainDefinitions([domains[0], domains[0]])).toThrow(/Duplicate cognitive domain/)
  })

  it('maps only real frozen task metric keys and never owns one primary metric from two domains', () => {
    const mappings = listCognitiveEvidenceMappings()
    expect(listCognitiveEvidenceMappings('1.0.0')).toEqual(mappings)
    expect(listCognitiveEvidenceMappings('9.9.9')).toEqual([])
    expect(mappings).toHaveLength(53)
    expect(mappings.map((mapping) => [
      mapping.testType,
      mapping.engineVersion,
      mapping.scoringVersion,
      mapping.metricDefinitionVersion,
      mapping.metricKey,
      mapping.domain,
      mapping.facet,
      mapping.role,
    ].join('/'))).toEqual(EXPECTED_MAPPING_TUPLES)
    expect(new Set(mappings.map((mapping) => mapping.domain))).toEqual(new Set([
      'processing_speed',
      'sustained_attention',
      'response_inhibition',
      'interference_control',
      'working_memory',
      'cognitive_flexibility',
      'episodic_learning_memory',
      'fluid_reasoning',
      'visuospatial_reasoning',
      'planning',
    ]))
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

    expect(() =>
      validateCognitiveEvidenceMappings([
        mappings[0],
        { ...mappings[0], facet: 'visual_comparison' },
      ]),
    ).toThrow(/Duplicate cognitive evidence mapping/)

    expect(() =>
      validateCognitiveEvidenceMappings([
        mappings[0],
        { ...mappings[0], role: 'supporting' },
      ]),
    ).toThrow(/same domain/)
  })

  it('keeps the PR14 protocols versioned and hidden from the create catalog', () => {
    const protocols = listAnalysisProtocolDefinitions()
    const expectedKeys = [
      'attention_stability_v1',
      'inhibitory_control_v1',
      'inhibitory_control_multisource_v1',
      'working_memory_v1',
      'executive_control_v1',
      'learning_reasoning_v1',
      'k12_core_profile_v1',
    ]
    const protocolByKey = new Map(protocols.map((protocol) => [protocol.key, protocol]))
    for (const key of expectedKeys) {
      expect(protocolByKey.get(key)).toMatchObject({
        key,
        version: '1.0.0',
        status: 'DRAFT',
        recommendedForCreate: false,
        profiles: ['standard', 'research'],
      })
      expect(listAnalysisProtocolCatalog().list.find((item) => item.key === key)).toBeUndefined()
    }
    expect(listAnalysisProtocolCatalog(true).list.find((item) => item.key === 'inhibitory_control_multisource_v1')).toMatchObject({
      scaleSlots: [{
        key: 'adexi_inhibition',
        expectedScaleCode: 'adexi_v1',
        expectedDimensionCode: 'inhibition',
        respondentType: 'participant_self_report',
        valueSelector: 'dimensionScore',
      }],
    })
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
        {
          ...base,
          status: 'PUBLISHED',
          recommendedForCreate: true,
          cognitiveSlots: base.cognitiveSlots.map((slot, index) => index === 0
            ? { ...slot, testType: 'not-implemented' }
            : slot),
        },
      ]),
    ).toThrow(/unresolved task: attention_stability_v1\/1.0.0\/not-implemented/)
  })

  it('scopes PR11 recommendation rules to multi-source protocols and requires a version bump before publish', () => {
    const cognitiveOnly = listAnalysisProtocolDefinitions().find((protocol) => protocol.scaleSlots.length === 0)
    const multisource = listAnalysisProtocolDefinitions().find((protocol) => protocol.scaleSlots.length > 0)
    if (!cognitiveOnly || !multisource) throw new Error('missing protocol fixtures')

    expect(() => validateAnalysisProtocolDefinitions([{
      ...cognitiveOnly,
      recommendationRuleVersion: '1.1.0',
    }])).toThrow(/multi-source protocol/)

    expect(() => validateAnalysisProtocolDefinitions([{
      ...multisource,
      status: 'PUBLISHED',
    }])).toThrow(/must bump protocol version/)
  })
})
