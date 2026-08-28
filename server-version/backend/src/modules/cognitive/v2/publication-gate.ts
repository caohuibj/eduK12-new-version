import { computeProtocolSignature } from './canonical'
import type { MetricDefinition, TaskDefinition } from './types'

export interface PublicationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

const issue = (path: string, message: string, severity: PublicationIssue['severity'] = 'error'): PublicationIssue => ({
  path,
  message,
  severity,
})

const validVisibility = new Set(['headline', 'user', 'detail', 'research_only', 'hidden'])
const validDirections = new Set(['higher_is_better', 'lower_is_better', 'target_range', 'descriptive', 'signed'])

export const validateTaskDefinition = <TConfig, TTrial>(
  definition: TaskDefinition<TConfig, TTrial>,
): PublicationIssue[] => {
  const issues: PublicationIssue[] = []
  if (definition.schemaVersion !== 1) issues.push(issue('schemaVersion', 'TaskDefinition schemaVersion must be 1'))
  for (const field of ['testType', 'name', 'category', 'engineVersion', 'scoringVersion']) {
    if (!definition[field as keyof TaskDefinition]) issues.push(issue(field, `${field} is required`))
  }
  if (!definition.configSchema || typeof definition.configSchema.safeParse !== 'function') issues.push(issue('configSchema', 'configSchema is required'))
  if (!definition.trialSchema || typeof definition.trialSchema.safeParse !== 'function') issues.push(issue('trialSchema', 'trialSchema is required'))
  if (typeof definition.scorer !== 'function') issues.push(issue('scorer', 'authoritative scorer is required'))
  if (!definition.protocol.key) issues.push(issue('protocol.key', 'protocol key is required'))
  if (!definition.protocol.version) issues.push(issue('protocol.version', 'protocol version is required'))
  if (definition.protocol.clock !== 'performance') issues.push(issue('protocol.clock', 'protocol clock must be performance'))
  if (definition.protocol.trialEnvelopeVersion !== 1) issues.push(issue('protocol.trialEnvelopeVersion', 'trial envelope version must be 1'))
  const protocolSignature = computeProtocolSignature(definition.protocol)
  if (!/^[0-9a-f]{64}$/.test(protocolSignature)) issues.push(issue('protocol', 'protocol signature must be a SHA-256 digest'))
  if (definition.protocol.measurementCriticalConfigPaths.length === 0) issues.push(issue('protocol.measurementCriticalConfigPaths', 'at least one measurement-critical config path is required'))
  const phaseKeys = new Set<string>()
  for (const [index, phase] of definition.protocol.phases.entries()) {
    if (phaseKeys.has(phase.key)) issues.push(issue(`protocol.phases.${index}.key`, 'protocol phase keys must be unique'))
    phaseKeys.add(phase.key)
    if (!phase.persists && phase.required) issues.push(issue(`protocol.phases.${index}`, 'a required phase must be persisted'))
  }
  if (definition.protocol.phases.length === 0 || !definition.protocol.phases.some((phase) => phase.persists && phase.required)) {
    issues.push(issue('protocol.phases', 'at least one required persisted phase is needed'))
  }
  if (definition.profiles.standard === undefined || definition.profiles.research === undefined) {
    issues.push(issue('profiles', 'standard and research profiles are required'))
  }

  const metricKeys = new Set(Object.keys(definition.metrics))
  const qualityKeys = new Set(Object.keys(definition.quality))
  for (const [key, metric] of Object.entries(definition.metrics)) {
    if (metric.key !== key) issues.push(issue(`metrics.${key}.key`, 'metric key must match its registry key'))
    if (!metric.label || !metric.category || !metric.construct || !metric.description) issues.push(issue(`metrics.${key}`, 'metric label/category/construct/description are required'))
    if (!validVisibility.has(metric.visibility)) issues.push(issue(`metrics.${key}.visibility`, 'metric visibility is invalid'))
    if (!validDirections.has(metric.direction)) issues.push(issue(`metrics.${key}.direction`, 'metric direction is invalid'))
    if (metric.availableProfiles.length === 0) issues.push(issue(`metrics.${key}.availableProfiles`, 'metric must declare at least one profile'))
    if (metric.visibility === 'headline' && metric.role === 'research_only') issues.push(issue(`metrics.${key}`, 'research_only metric cannot be headline-visible'))
    for (const [index, qualityKey] of (metric.requiresQualityFlags ?? []).entries()) {
      if (!qualityKeys.has(qualityKey)) {
        issues.push(issue(`metrics.${key}.requiresQualityFlags.${index}`, `${qualityKey} is not declared in quality definitions`))
      }
    }
  }

  const assertVisibility = (keys: string[], visibility: MetricDefinition['visibility'], path: string) => {
    for (const [index, key] of keys.entries()) {
      const metric = definition.metrics[key]
      if (metric && metric.visibility !== visibility) {
        issues.push(issue(`${path}.${index}`, `${key} must be declared with ${visibility} visibility`))
      }
    }
  }
  assertVisibility(definition.report.headlineMetrics, 'headline', 'report.headlineMetrics')
  assertVisibility(definition.report.userMetrics, 'user', 'report.userMetrics')
  assertVisibility(definition.report.detailMetrics, 'detail', 'report.detailMetrics')

  for (const [key, quality] of Object.entries(definition.quality)) {
    if (quality.key !== key) issues.push(issue(`quality.${key}.key`, 'quality key must match its registry key'))
    if (!quality.label || !quality.description) issues.push(issue(`quality.${key}`, 'quality label and description are required'))
  }

  const reportKeys = [
    ...definition.report.headlineMetrics,
    ...definition.report.userMetrics,
    ...definition.report.detailMetrics,
  ]
  for (const key of reportKeys) {
    if (!metricKeys.has(key)) issues.push(issue(`report.${key}`, 'report references an unknown metric'))
  }
  for (const mapping of definition.references) {
    if (!metricKeys.has(mapping.metricKey)) issues.push(issue(`references.${mapping.metricKey}`, 'reference mapping references an unknown metric'))
    if (!definition.metrics[mapping.metricKey]?.referenceEligible) issues.push(issue(`references.${mapping.metricKey}`, 'reference mapping requires a reference-eligible metric'))
    if (mapping.instrumentVersion !== definition.engineVersion) issues.push(issue(`references.${mapping.metricKey}.instrumentVersion`, 'reference instrumentVersion must match the task engineVersion'))
    if (mapping.scoringVersion !== definition.scoringVersion) issues.push(issue(`references.${mapping.metricKey}.scoringVersion`, 'reference scoringVersion must match the task scoringVersion'))
    if (mapping.direction !== definition.metrics[mapping.metricKey]?.direction) issues.push(issue(`references.${mapping.metricKey}.direction`, 'reference direction must match the metric direction'))
  }
  if (definition.publication.status === 'PUBLISHED' && definition.publication.referenceRequired && definition.references.length === 0) {
    issues.push(issue('references', 'published task requires at least one reference mapping'))
  }
  if (!definition.report.disclaimer) issues.push(issue('report.disclaimer', 'report disclaimer is required'))
  return issues
}

export const assertTaskContractValid = <TConfig, TTrial>(definition: TaskDefinition<TConfig, TTrial>): void => {
  const errors = validateTaskDefinition(definition).filter((candidate) => candidate.severity === 'error')
  if (errors.length > 0) throw new Error(`Cognitive task publication gate failed: ${errors.map((candidate) => `${candidate.path}: ${candidate.message}`).join('; ')}`)
}

export const assertTaskCanPublish = <TConfig, TTrial>(definition: TaskDefinition<TConfig, TTrial>): void => {
  assertTaskContractValid(definition)
  if (definition.publication.status !== 'PUBLISHED') {
    throw new Error(`Cognitive task publication gate failed: publication.status must be PUBLISHED (received ${definition.publication.status})`)
  }
}
