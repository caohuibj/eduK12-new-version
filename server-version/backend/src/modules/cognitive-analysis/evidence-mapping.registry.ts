import { getCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import type { CognitiveMetricEvidenceMapping } from './cognitive-analysis.types'
import { getCognitiveDomainDefinition } from './domain.registry'

const COGNITIVE_EVIDENCE_MAPPING_V1_VERSION = '1.0.0'
export const COGNITIVE_EVIDENCE_MAPPING_VERSION = COGNITIVE_EVIDENCE_MAPPING_V1_VERSION

const source = (
  testType: string,
  scoringVersion: string,
  metricDefinitionVersion: string,
  metricKey: string,
  domain: CognitiveMetricEvidenceMapping['domain'],
  facet: string,
  role: CognitiveMetricEvidenceMapping['role'],
): CognitiveMetricEvidenceMapping => ({
  testType,
  engineVersion: '1.0.0',
  scoringVersion,
  metricDefinitionVersion,
  metricKey,
  domain,
  facet,
  role,
})

const MAPPINGS_V1: CognitiveMetricEvidenceMapping[] = [
  source('reaction', '1.1.0', '1.1.0', 'medianRtMs', 'processing_speed', 'simple_response', 'primary'),
  source('patterncompare', '1.0.0', '1.0.0', 'correctPerMinute', 'processing_speed', 'visual_comparison', 'primary'),
  source('patterncompare', '1.0.0', '1.0.0', 'medianCorrectRtMs', 'processing_speed', 'visual_comparison', 'primary'),
  source('cpt', '1.0.0', '1.0.0', 'hitMedianRtMs', 'processing_speed', 'simple_response', 'supporting'),
  source('reaction', '1.1.0', '1.1.0', 'rtICV', 'sustained_attention', 'response_stability', 'supporting'),
  source('reaction', '1.1.0', '1.1.0', 'missRate', 'sustained_attention', 'omission_control', 'supporting'),
  source('cpt', '1.0.0', '1.0.0', 'dPrime', 'sustained_attention', 'target_discrimination', 'primary'),
  source('cpt', '1.0.0', '1.0.0', 'omissionRate', 'sustained_attention', 'omission_control', 'primary'),
  source('cpt', '1.0.0', '1.0.0', 'rtICV', 'sustained_attention', 'response_stability', 'primary'),
  source('cpt', '1.0.0', '1.0.0', 'commissionRate', 'response_inhibition', 'action_withholding', 'supporting'),
  source('gonogo', '1.0.0', '1.0.0', 'commissionRate', 'response_inhibition', 'action_withholding', 'primary'),
  source('gonogo', '1.0.0', '1.0.0', 'dPrime', 'response_inhibition', 'action_withholding', 'primary'),
  source('sst', '1.0.0', '1.0.0', 'ssrtMs', 'response_inhibition', 'action_cancellation', 'primary'),
  source('sst', '1.0.0', '1.0.0', 'pRespondStop', 'response_inhibition', 'action_cancellation', 'primary'),
  source('stroop', '1.1.0', '1.1.0', 'stroopEffectMs', 'interference_control', 'semantic_interference', 'primary'),
  source('stroop', '1.1.0', '1.1.0', 'incongruentAccuracy', 'interference_control', 'semantic_interference', 'primary'),
  source('flanker', '1.0.0', '1.0.0', 'flankerEffectMs', 'interference_control', 'perceptual_interference', 'primary'),
  source('flanker', '1.0.0', '1.0.0', 'incongruentAccuracy', 'interference_control', 'perceptual_interference', 'primary'),
  source('stroop', '1.1.0', '1.1.0', 'errorCost', 'interference_control', 'semantic_interference', 'supporting'),
  source('flanker', '1.0.0', '1.0.0', 'errorCost', 'interference_control', 'perceptual_interference', 'supporting'),
  source('memory', '1.1.0', '1.1.0', 'maxSpan', 'working_memory', 'verbal_storage', 'primary'),
  source('memory', '1.1.0', '1.1.0', 'totalCorrectTrials', 'working_memory', 'verbal_storage', 'primary'),
  source('digitbackward', '1.0.0', '1.0.0', 'maxSpan', 'working_memory', 'verbal_manipulation', 'primary'),
  source('digitbackward', '1.0.0', '1.0.0', 'totalCorrectTrials', 'working_memory', 'verbal_manipulation', 'primary'),
  source('digitbackward', '1.0.0', '1.0.0', 'sequenceDistance', 'working_memory', 'verbal_manipulation', 'supporting'),
  source('corsi', '1.0.0', '1.0.0', 'maxSpan', 'working_memory', 'visuospatial_storage', 'primary'),
  source('corsi', '1.0.0', '1.0.0', 'totalCorrectTrials', 'working_memory', 'visuospatial_storage', 'primary'),
  source('corsi', '1.0.0', '1.0.0', 'sequenceErrorDistance', 'working_memory', 'visuospatial_storage', 'supporting'),
  source('nback', '1.0.0', '1.0.0', 'dPrimeByN', 'working_memory', 'updating', 'primary'),
  source('nback', '1.0.0', '1.0.0', 'maxReliableN', 'working_memory', 'updating', 'primary'),
  source('nback', '1.0.0', '1.0.0', 'loadCostDPrime', 'working_memory', 'updating', 'supporting'),
  source('taskswitch', '1.0.0', '1.0.0', 'switchCostRtMs', 'cognitive_flexibility', 'trial_switching', 'primary'),
  source('taskswitch', '1.0.0', '1.0.0', 'switchCostAccuracy', 'cognitive_flexibility', 'trial_switching', 'primary'),
  source('cardsort', '1.0.0', '1.0.0', 'switchCostRtMs', 'cognitive_flexibility', 'rule_shifting', 'primary'),
  source('cardsort', '1.0.0', '1.0.0', 'perseverativeErrorRate', 'cognitive_flexibility', 'rule_shifting', 'primary'),
  source('cardsort', '1.0.0', '1.0.0', 'postSwitchRecovery', 'cognitive_flexibility', 'rule_shifting', 'supporting'),
  source('picturesequence', '1.0.0', '1.0.0', 'adjacentPairScore', 'episodic_learning_memory', 'sequence_learning', 'primary'),
  source('picturesequence', '1.0.0', '1.0.0', 'learningGain', 'episodic_learning_memory', 'sequence_learning', 'primary'),
  source('picturesequence', '1.0.0', '1.0.0', 'delayedRetention', 'episodic_learning_memory', 'sequence_learning', 'supporting'),
  source('pairedassociate', '1.0.0', '1.0.0', 'learningSlope', 'episodic_learning_memory', 'paired_learning', 'primary'),
  source('pairedassociate', '1.0.0', '1.0.0', 'trialsToCriterion', 'episodic_learning_memory', 'paired_learning', 'primary'),
  source('pairedassociate', '1.0.0', '1.0.0', 'delayedAccuracy', 'episodic_learning_memory', 'paired_learning', 'supporting'),
  source('matrix', '1.0.0', '1.0.0', 'accuracy', 'fluid_reasoning', 'rule_induction', 'primary'),
  source('matrix', '1.0.0', '1.0.0', 'accuracyByRuleFamily', 'fluid_reasoning', 'rule_induction', 'primary'),
  source('matrix', '1.0.0', '1.0.0', 'reachedDifficulty', 'fluid_reasoning', 'rule_induction', 'supporting'),
  source('matrix', '1.0.0', '1.0.0', 'medianRtMs', 'fluid_reasoning', 'rule_induction', 'supporting'),
  source('mentalrotation', '1.0.0', '1.0.0', 'accuracy', 'visuospatial_reasoning', 'mental_rotation', 'primary'),
  source('mentalrotation', '1.0.0', '1.0.0', 'angleCost', 'visuospatial_reasoning', 'mental_rotation', 'primary'),
  source('mentalrotation', '1.0.0', '1.0.0', 'medianCorrectRtMs', 'visuospatial_reasoning', 'mental_rotation', 'supporting'),
  source('tower', '1.0.0', '1.0.0', 'minimumMoveSolveRate', 'planning', 'look_ahead', 'primary'),
  source('tower', '1.0.0', '1.0.0', 'excessMoves', 'planning', 'look_ahead', 'primary'),
  source('tower', '1.0.0', '1.0.0', 'firstMoveLatencyMs', 'planning', 'look_ahead', 'supporting'),
  source('tower', '1.0.0', '1.0.0', 'ruleViolations', 'planning', 'look_ahead', 'supporting'),
]

const mappingKey = (mapping: CognitiveMetricEvidenceMapping): string =>
  [
    mapping.testType,
    mapping.engineVersion,
    mapping.scoringVersion,
    mapping.metricDefinitionVersion,
    mapping.metricKey,
    mapping.domain,
    mapping.role,
  ].join('/')

export const validateCognitiveEvidenceMappings = (
  mappings: CognitiveMetricEvidenceMapping[],
): void => {
  const keys = new Set<string>()
  const metricOwners = new Map<string, { primary?: string; supporting?: string }>()
  for (const mapping of mappings) {
    const key = mappingKey(mapping)
    if (keys.has(key)) throw new Error(`Duplicate cognitive evidence mapping: ${key}`)
    keys.add(key)

    const domain = getCognitiveDomainDefinition(mapping.domain)
    if (!domain) throw new Error(`Unknown cognitive evidence domain: ${mapping.domain}`)
    if (!domain.facets.some((facet) => facet.key === mapping.facet)) {
      throw new Error(`Unknown cognitive evidence facet: ${mapping.domain}/${mapping.facet}`)
    }

    const entry = getCognitiveRegistryEntry(
      mapping.testType,
      mapping.engineVersion,
      mapping.scoringVersion,
    )
    if (!entry) {
      throw new Error(
        `Unknown cognitive evidence task version: ${mapping.testType}/${mapping.engineVersion}/${mapping.scoringVersion}`,
      )
    }
    if (entry.metricDefinitionVersion !== mapping.metricDefinitionVersion) {
      throw new Error(`Cognitive evidence metric definition version mismatch: ${key}`)
    }
    if (!entry.metricDefinitions[mapping.metricKey]) {
      throw new Error(`Unknown cognitive evidence metric: ${key}`)
    }

    const sourceMetric = [
      mapping.testType,
      mapping.engineVersion,
      mapping.scoringVersion,
      mapping.metricDefinitionVersion,
      mapping.metricKey,
    ].join('/')
    const owner = metricOwners.get(sourceMetric) ?? {}
    if (mapping.role === 'primary') {
      if (owner.primary) {
        throw new Error(
          `Cognitive evidence primary metric mapped to multiple domains or more than once: ${sourceMetric}`,
        )
      }
      if (owner.supporting === mapping.domain) {
        throw new Error(
          `Cognitive evidence metric cannot be primary and supporting in the same domain: ${sourceMetric}`,
        )
      }
      owner.primary = mapping.domain
    } else {
      if (owner.supporting) {
        throw new Error(
          `Cognitive evidence supporting metric mapped more than once: ${sourceMetric}`,
        )
      }
      if (owner.primary === mapping.domain) {
        throw new Error(
          `Cognitive evidence metric cannot be primary and supporting in the same domain: ${sourceMetric}`,
        )
      }
      owner.supporting = mapping.domain
    }
    metricOwners.set(sourceMetric, owner)
  }
}

validateCognitiveEvidenceMappings(MAPPINGS_V1)

const MAPPINGS_BY_VERSION = new Map<string, CognitiveMetricEvidenceMapping[]>([
  [COGNITIVE_EVIDENCE_MAPPING_V1_VERSION, MAPPINGS_V1],
])

export const hasCognitiveEvidenceMappingVersion = (version: string): boolean =>
  MAPPINGS_BY_VERSION.has(version)

export const listCognitiveEvidenceMappings = (
  version = COGNITIVE_EVIDENCE_MAPPING_VERSION,
): CognitiveMetricEvidenceMapping[] =>
  (MAPPINGS_BY_VERSION.get(version) ?? []).map((mapping) => ({ ...mapping }))

export const listCognitiveEvidenceMappingsForTask = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
  mappingVersion = COGNITIVE_EVIDENCE_MAPPING_VERSION,
): CognitiveMetricEvidenceMapping[] =>
  (MAPPINGS_BY_VERSION.get(mappingVersion) ?? []).filter(
    (mapping) =>
      mapping.testType === testType &&
      mapping.engineVersion === engineVersion &&
      mapping.scoringVersion === scoringVersion,
  ).map((mapping) => ({ ...mapping }))
