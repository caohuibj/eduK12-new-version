import { getCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import type { CognitiveMetricEvidenceMapping } from './cognitive-analysis.types'
import { getCognitiveDomainDefinition } from './domain.registry'

export const COGNITIVE_EVIDENCE_MAPPING_VERSION = '1.0.0'

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

const MAPPINGS: CognitiveMetricEvidenceMapping[] = [
  source('reaction', '1.1.0', '1.1.0', 'medianRtMs', 'processing_speed', 'simple_response', 'primary'),
  source('reaction', '1.1.0', '1.1.0', 'rtICV', 'sustained_attention', 'response_stability', 'supporting'),
  source('reaction', '1.1.0', '1.1.0', 'missRate', 'sustained_attention', 'omission_control', 'supporting'),
  source('cpt', '1.0.0', '1.0.0', 'hitMedianRtMs', 'processing_speed', 'simple_response', 'supporting'),
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
  source('memory', '1.1.0', '1.1.0', 'maxSpan', 'working_memory', 'verbal_storage', 'primary'),
  source('memory', '1.1.0', '1.1.0', 'totalCorrectTrials', 'working_memory', 'verbal_storage', 'primary'),
  source('corsi', '1.0.0', '1.0.0', 'maxSpan', 'working_memory', 'visuospatial_storage', 'primary'),
  source('corsi', '1.0.0', '1.0.0', 'totalCorrectTrials', 'working_memory', 'visuospatial_storage', 'primary'),
  source('nback', '1.0.0', '1.0.0', 'dPrimeByN', 'working_memory', 'updating', 'primary'),
  source('nback', '1.0.0', '1.0.0', 'maxReliableN', 'working_memory', 'updating', 'primary'),
  source('nback', '1.0.0', '1.0.0', 'loadCostDPrime', 'working_memory', 'updating', 'supporting'),
  source('taskswitch', '1.0.0', '1.0.0', 'switchCostRtMs', 'cognitive_flexibility', 'trial_switching', 'primary'),
  source('taskswitch', '1.0.0', '1.0.0', 'switchCostAccuracy', 'cognitive_flexibility', 'trial_switching', 'primary'),
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
  const primaryMetricOwners = new Map<string, string>()
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

    if (mapping.role === 'primary') {
      const sourceMetric = [
        mapping.testType,
        mapping.engineVersion,
        mapping.scoringVersion,
        mapping.metricDefinitionVersion,
        mapping.metricKey,
      ].join('/')
      const existingDomain = primaryMetricOwners.get(sourceMetric)
      if (existingDomain && existingDomain !== mapping.domain) {
        throw new Error(
          `Cognitive evidence primary metric mapped to multiple domains: ${sourceMetric}`,
        )
      }
      primaryMetricOwners.set(sourceMetric, mapping.domain)
    }
  }
}

validateCognitiveEvidenceMappings(MAPPINGS)

export const listCognitiveEvidenceMappings = (): CognitiveMetricEvidenceMapping[] =>
  MAPPINGS.map((mapping) => ({ ...mapping }))

export const listCognitiveEvidenceMappingsForTask = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveMetricEvidenceMapping[] =>
  MAPPINGS.filter(
    (mapping) =>
      mapping.testType === testType &&
      mapping.engineVersion === engineVersion &&
      mapping.scoringVersion === scoringVersion,
  ).map((mapping) => ({ ...mapping }))
