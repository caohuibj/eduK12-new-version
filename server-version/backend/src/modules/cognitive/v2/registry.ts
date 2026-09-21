import {
  getCognitiveRegistryEntry,
  listCognitiveRegistryEntries,
} from '../cognitive.registry'
import type { RegistryEntry } from '../cognitive.types'
import { buildQualityAssessment } from './quality'
import { parseCognitivePresentationDefinition } from './presentation'
import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  ReportDefinition,
  TaskDefinition,
} from './types'

type AnyRegistryEntry = RegistryEntry<unknown, unknown>

export interface RegistryReferenceEligibilityIssue {
  path: string
  message: string
}

/** Validate the exact RegistryEntry-owned reference allowlist independently of release state. */
export const validateRegistryReferenceEligibility = (entry: {
  metricDefinitions: Record<string, { valueType: string; role: string }>
  referenceEligibleMetricKeys?: unknown
}): RegistryReferenceEligibilityIssue[] => {
  const issues: RegistryReferenceEligibilityIssue[] = []
  const keys = entry.referenceEligibleMetricKeys
  if (!Array.isArray(keys)) {
    return [{ path: 'referenceEligibleMetricKeys', message: 'referenceEligibleMetricKeys must be an array' }]
  }
  const seen = new Set<string>()
  keys.forEach((key, index) => {
    const path = `referenceEligibleMetricKeys.${index}`
    if (typeof key !== 'string' || key.length === 0) {
      issues.push({ path, message: 'eligible metric key must be a non-empty string' })
      return
    }
    if (seen.has(key)) issues.push({ path, message: `duplicate eligible metric key: ${key}` })
    seen.add(key)
    const metric = entry.metricDefinitions[key]
    if (!metric) {
      issues.push({ path, message: `unknown eligible metric key: ${key}` })
      return
    }
    if (metric.valueType !== 'number' && metric.valueType !== 'integer') {
      issues.push({ path, message: `eligible metric ${key} must expose a scalar number or integer valueType` })
    }
    if (metric.role === 'quality' || metric.role === 'research_only') {
      issues.push({ path, message: `quality or research_only metric ${key} cannot be reference eligible` })
    }
  })
  return issues
}

const profileList: CognitiveProfile[] = ['experience', 'standard', 'research']
const metricVisibility = (key: string, entry: AnyRegistryEntry): MetricDefinition['visibility'] => {
  const report = entry.reportDefinition
  if (key === report.headlineMetric) return 'headline'
  if (report.primaryMetrics.includes(key)) return 'user'
  if (entry.metricDefinitions[key]?.role === 'research_only') return 'research_only'
  return 'detail'
}

const adaptMetricDefinitions = (entry: AnyRegistryEntry): Record<string, MetricDefinition> => {
  const eligibleMetricKeys = new Set(Array.isArray(entry.referenceEligibleMetricKeys) ? entry.referenceEligibleMetricKeys : [])
  return Object.fromEntries(Object.entries(entry.metricDefinitions).map(([key, metric]) => [key, {
    key,
    label: metric.label,
    ...(metric.shortLabel ? { shortLabel: metric.shortLabel } : {}),
    category: entry.executionSemantics?.metricCategories[key] ?? metric.construct ?? entry.category,
    construct: metric.construct,
    description: metric.description,
    unit: metric.unit,
    valueType: metric.valueType,
    direction: metric.direction,
    visibility: metricVisibility(key, entry),
    role: metric.role,
    ...(metric.precision === undefined ? {} : { precision: metric.precision }),
    availableProfiles: metric.availableProfiles,
    referenceEligible: eligibleMetricKeys.has(key),
    ...(metric.requiresQualityFlags ? { requiresQualityFlags: metric.requiresQualityFlags } : {}),
    export: metric.export,
  }])) as Record<string, MetricDefinition>
}

const adaptQualityDefinitions = (entry: AnyRegistryEntry): Record<string, QualityDefinition> => ({
  ...Object.fromEntries(Object.entries(entry.qualityDefinitions).map(([key, quality]) => [key, {
    key,
    label: quality.label,
    description: quality.description,
    effect: entry.executionSemantics?.qualityEffects[key] ?? 'limited',
  }])),
  legacyUninterpretable: {
    key: 'legacyUninterpretable',
    label: '结果质量受限',
    description: '旧版计分器判定本次结果不满足完整解释条件。',
    effect: 'limited',
  },
})

const adaptReportDefinition = (entry: AnyRegistryEntry, metrics: Record<string, MetricDefinition>): ReportDefinition => {
  const headline = entry.reportDefinition.headlineMetric ?? entry.reportDefinition.primaryMetrics[0]
  const primary = entry.reportDefinition.primaryMetrics.filter((key) => key !== headline && metrics[key])
  const details = [
    ...entry.reportDefinition.secondaryMetrics,
    ...Object.values(metrics).filter((metric) => metric.role === 'quality').map((metric) => metric.key),
  ].filter((key, index, all) => metrics[key]?.visibility === 'detail' && all.indexOf(key) === index)
  return {
    schemaVersion: 1,
    version: entry.reportDefinitionVersion,
    title: entry.reportDefinition.title,
    headlineMetrics: headline && metrics[headline] ? [headline] : [],
    userMetrics: primary,
    detailMetrics: details,
    disclaimer: entry.reportDefinition.disclaimer,
    practicalTips: entry.reportDefinition.practicalTips ?? [],
  }
}

// Unregistered test definitions use generic semantics only. Production packages declare every effect and phase.
const adaptProtocol = (entry: AnyRegistryEntry) => entry.executionSemantics?.protocol ?? ({
  schemaVersion: 1 as const,
  key: `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`,
  version: '1.0.0', clock: 'performance' as const,
  randomizationAlgorithmVersion: entry.randomizationAlgorithmVersion,
  trialEnvelopeVersion: 1 as const,
  phases: [{ key: 'test' as const, persists: true, required: true }],
  measurementCriticalConfigPaths: ['*'],
})

export const buildCognitiveV2TaskDefinition = (
  entry: AnyRegistryEntry,
  legacyPublicationStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED' = entry.executionSemantics?.legacyStatus ?? 'DRAFT',
): TaskDefinition<unknown, unknown> => {
  const metrics = adaptMetricDefinitions(entry)
  const quality = adaptQualityDefinitions(entry)
  const protocol = adaptProtocol(entry)
  return {
    schemaVersion: 1,
    testType: entry.testType,
    name: entry.name,
    category: entry.category,
    engineVersion: entry.engineVersion,
    scoringVersion: entry.scoringVersion,
    ...(entry.presentation ? { presentation: parseCognitivePresentationDefinition(entry.presentation) } : {}),
    configSchema: entry.configSchema,
    trialSchema: entry.trialSchema,
    protocol,
    finalSubmission: entry.finalSubmission,
    scorer: ({ config, trials, randomSeed }) => {
      const legacy = entry.score({
        config,
        trials: trials.map((trial) => ({ trialIndex: trial.trialIndex, payload: trial.payload })),
        randomSeed,
      })
      const booleanFlags = Object.fromEntries(
        Object.entries(legacy.qualityFlags).filter(([, value]) => typeof value === 'boolean'),
      ) as Record<string, boolean>
      if (legacy.qualityFlags.interpretable === false) booleanFlags.legacyUninterpretable = true
      delete booleanFlags.interpretable
      return {
        metrics: legacy.metrics,
        quality: buildQualityAssessment({ flags: booleanFlags, definitions: quality }),
        audit: { trialCount: trials.length, scorerVersion: entry.scoringVersion },
      }
    },
    profiles: Object.fromEntries(profileList.map((profile) => [profile, {
      estimatedMinutes: entry.profiles[profile].estimatedMinutes,
      configPatch: entry.profiles[profile].configPatch,
      reportCaveats: entry.profiles[profile].reportCaveats,
    }])) as TaskDefinition<unknown, unknown>['profiles'],
    metrics,
    quality,
    references: [],
    report: adaptReportDefinition(entry, metrics),
    publication: {
      status: legacyPublicationStatus,
      referenceRequired: false,
      evidenceNote: 'DEPRECATED compatibility metadata only; CognitiveTestConfig.status is the product release authority.',
    },
  }
}

export const listCognitiveV2TaskDefinitions = (): TaskDefinition<unknown, unknown>[] =>
  listCognitiveRegistryEntries().map((entry) => buildCognitiveV2TaskDefinition(entry))

export const getCognitiveV2TaskDefinition = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): TaskDefinition<unknown, unknown> | undefined => {
  const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  return entry ? buildCognitiveV2TaskDefinition(entry) : undefined
}
