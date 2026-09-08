import {
  getCognitiveRegistryEntry,
  listCognitiveRegistryEntries,
} from '../cognitive.registry'
import type { RegistryEntry } from '../cognitive.types'
import { listCognitiveEvidenceMappingsForTask } from '../../cognitive-analysis/evidence-mapping.registry'
import { buildQualityAssessment } from './quality'
import { createCognitiveFinalSubmissionDefinition } from './final-submission-budget'
import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  ReportDefinition,
  TaskDefinition,
} from './types'

type AnyRegistryEntry = RegistryEntry<unknown, unknown>

const profileList: CognitiveProfile[] = ['experience', 'standard', 'research']

// Existing Trail Making scorer flags are provenance warnings: they do not
// change metrics or legacy interpretability. Keep that historical meaning when
// adapting into v2 instead of letting the legacy name-based fallback demote the
// entire cognitive result to LIMITED.
const nonDegradingProvenanceQualityFlags = new Set([
  'deviceInfoIncomplete',
  'mixedPointerType',
])

const qualityEffect = (key: string): QualityDefinition['effect'] => {
  if (nonDegradingProvenanceQualityFlags.has(key)) return 'none'
  if (/invalid|corrupt|malformed/i.test(key)) return 'invalid'
  if (key === 'interpretable') return 'none'
  return 'limited'
}

const metricVisibility = (
  key: string,
  entry: AnyRegistryEntry,
): MetricDefinition['visibility'] => {
  const report = entry.reportDefinition
  if (key === report.headlineMetric) return 'headline'
  if (report.primaryMetrics.includes(key)) return 'user'
  if (entry.metricDefinitions[key]?.role === 'research_only') return 'research_only'
  return 'detail'
}

const metricCategory = (key: string, entry: AnyRegistryEntry): string => {
  const mapping = listCognitiveEvidenceMappingsForTask(
    entry.testType,
    entry.engineVersion,
    entry.scoringVersion,
  ).find((candidate) => candidate.metricKey === key)
  return mapping?.domain ?? entry.metricDefinitions[key]?.construct ?? entry.category
}

const adaptMetricDefinitions = (entry: AnyRegistryEntry): Record<string, MetricDefinition> =>
  Object.fromEntries(Object.entries(entry.metricDefinitions).map(([key, metric]) => [key, {
    key,
    label: metric.label,
    ...(metric.shortLabel ? { shortLabel: metric.shortLabel } : {}),
    category: metricCategory(key, entry),
    construct: metric.construct,
    description: metric.description,
    unit: metric.unit,
    valueType: metric.valueType,
    direction: metric.direction,
    visibility: metricVisibility(key, entry),
    role: metric.role,
    ...(metric.precision === undefined ? {} : { precision: metric.precision }),
    availableProfiles: metric.availableProfiles,
    referenceEligible: metric.role === 'primary' || entry.reportDefinition.primaryMetrics.includes(key),
    ...(metric.requiresQualityFlags ? { requiresQualityFlags: metric.requiresQualityFlags } : {}),
    export: metric.export,
  }])) as Record<string, MetricDefinition>

const adaptQualityDefinitions = (entry: AnyRegistryEntry): Record<string, QualityDefinition> => ({
  ...Object.fromEntries(Object.entries(entry.qualityDefinitions).map(([key, quality]) => [key, {
    key,
    label: quality.label,
    description: quality.description,
    effect: qualityEffect(key),
  }])),
  legacyUninterpretable: {
    key: 'legacyUninterpretable',
    label: '结果质量受限',
    description: '旧版计分器判定本次结果不满足完整解释条件。',
    effect: 'limited',
  },
})

const adaptReportDefinition = (entry: AnyRegistryEntry, metrics: Record<string, MetricDefinition>): ReportDefinition => {
  const headline = entry.reportDefinition.headlineMetric
    ?? entry.reportDefinition.primaryMetrics[0]
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

const phasefulTasks = new Set(['picturesequence', 'pairedassociate', 'wordlist'])

const adaptProtocol = (entry: AnyRegistryEntry) => ({
  schemaVersion: 1 as const,
  key: `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`,
  version: '1.0.0',
  clock: 'performance' as const,
  randomizationAlgorithmVersion: entry.randomizationAlgorithmVersion,
  trialEnvelopeVersion: 1 as const,
  phases: phasefulTasks.has(entry.testType)
    ? [
        { key: 'learning' as const, persists: true, required: true },
        { key: 'delayed' as const, persists: true, required: false },
      ]
    : [{ key: 'test' as const, persists: true, required: true }],
  // The resolved config is the measurement contract for the existing tasks.
  // A later task-specific definition can narrow this list without changing the
  // snapshot or scorer boundary.
  measurementCriticalConfigPaths: ['*'],
})

export const buildCognitiveV2TaskDefinition = (
  entry: AnyRegistryEntry,
  publicationStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED' = 'DRAFT',
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
    configSchema: entry.configSchema,
    trialSchema: entry.trialSchema,
    protocol,
    finalSubmission: createCognitiveFinalSubmissionDefinition(entry.testType),
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
      status: publicationStatus,
      referenceRequired: false,
      evidenceNote: 'Reference eligibility is metric-specific; no eligible reference is silently inferred.',
    },
  }
}

const defaultStatus = (entry: AnyRegistryEntry): 'DRAFT' | 'PUBLISHED' =>
  entry.testType !== 'fake' && entry.recommendedForCreate === true ? 'PUBLISHED' : 'DRAFT'

export const listCognitiveV2TaskDefinitions = (): TaskDefinition<unknown, unknown>[] =>
  listCognitiveRegistryEntries()
    .map((entry) => buildCognitiveV2TaskDefinition(entry, defaultStatus(entry)))

export const getCognitiveV2TaskDefinition = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): TaskDefinition<unknown, unknown> | undefined => {
  const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  return entry ? buildCognitiveV2TaskDefinition(entry, defaultStatus(entry)) : undefined
}
