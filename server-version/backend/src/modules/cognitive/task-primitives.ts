import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from './cognitive.types'

export const allProfiles: CognitiveProfile[] = ['experience', 'standard', 'research']

export const metric = (
  key: string,
  label: string,
  construct: string,
  unit: MetricDefinition['unit'],
  direction: MetricDefinition['direction'],
  role: MetricDefinition['role'],
  extra: Partial<MetricDefinition> = {},
): MetricDefinition => ({
  key,
  label,
  construct,
  description: label,
  unit,
  valueType: unit === 'map' ? 'object' : unit === 'count' || unit === 'level' ? 'integer' : 'number',
  direction,
  role,
  availableProfiles: allProfiles,
  export: { summary: role !== 'research_only', label },
  ...extra,
})

