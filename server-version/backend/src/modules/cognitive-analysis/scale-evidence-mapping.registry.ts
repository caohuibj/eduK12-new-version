import type { CognitiveDomainKey, EvidenceRole } from './cognitive-analysis.types'

export interface ScaleDimensionEvidenceMapping {
  mappingKey: string
  mappingVersion: string
  scaleCode: string
  dimensionCode: string
  domain: CognitiveDomainKey
  facet: string
  role: EvidenceRole
  directionClass: 'more_difficulty' | 'more_strength'
  respondentType: 'participant_self_report'
  valueSelector: 'dimensionScore'
}

export const SCALE_EVIDENCE_MAPPING_VERSION = '1.0.0'

const ADEXI_INHIBITION_MAPPING: ScaleDimensionEvidenceMapping = {
  mappingKey: 'adexi_v1.inhibition.response_inhibition.v1',
  mappingVersion: SCALE_EVIDENCE_MAPPING_VERSION,
  scaleCode: 'adexi_v1',
  dimensionCode: 'inhibition',
  domain: 'response_inhibition',
  facet: 'action_withholding',
  role: 'primary',
  directionClass: 'more_difficulty',
  respondentType: 'participant_self_report',
  valueSelector: 'dimensionScore',
}

const MAPPINGS = [ADEXI_INHIBITION_MAPPING]

export const getScaleDimensionEvidenceMapping = (
  mappingKey: string,
  mappingVersion = SCALE_EVIDENCE_MAPPING_VERSION,
): ScaleDimensionEvidenceMapping | undefined => {
  const mapping = MAPPINGS.find((candidate) =>
    candidate.mappingKey === mappingKey && candidate.mappingVersion === mappingVersion)
  return mapping ? { ...mapping } : undefined
}

export const listScaleDimensionEvidenceMappings = (
  mappingVersion = SCALE_EVIDENCE_MAPPING_VERSION,
): ScaleDimensionEvidenceMapping[] => MAPPINGS
  .filter((mapping) => mapping.mappingVersion === mappingVersion)
  .map((mapping) => ({ ...mapping }))
