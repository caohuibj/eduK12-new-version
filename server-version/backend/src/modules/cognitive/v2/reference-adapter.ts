import { resolveAssessmentReference, validateReferenceSetDefinition, type AssessmentReferenceSetDefinition, type ReferenceContext, type ResolvedScaleReference } from '../../assessment-reference/reference'
import type { AssessmentContextV1 } from '../../assessment-context'
import { metricIsQualityGated } from './quality'
import type { MetricDirection, QualityAssessment, ReferenceApplicability, TaskDefinition } from './types'

export interface CognitiveMetricReference extends ResolvedScaleReference {
  metricKey: string
  direction: MetricDirection
  /** Direction-aware interpretation for UI/report consumers. */
  relativePosition: 'above_reference' | 'below_reference' | 'within_reference' | 'descriptive' | null
}

const toReferenceContext = (context: AssessmentContextV1 | null | undefined): ReferenceContext => (
  context?.values ?? {}
)

const contextValueMissing = (value: unknown): boolean => (
  value === undefined || value === null || value === '' || value === 'not_disclosed'
)

const requiredContextMissing = (
  requiredContext: ReferenceApplicability['requiredContext'],
  context: ReferenceContext,
): boolean => requiredContext?.some((key) => {
  if (key === 'age') return contextValueMissing(context.ageMonthsAtFreeze) && contextValueMissing(context.ageBand)
  if (key === 'sexAtBirth') return contextValueMissing(context.sexAtBirth) && contextValueMissing(context.sexScope)
  if (key === 'gradeLevel') return contextValueMissing(context.gradeLevel)
  if (key === 'primaryLanguage') return contextValueMissing(context.primaryLanguage) && contextValueMissing(context.language)
  return contextValueMissing(context.countryOrRegion)
}) ?? false

const relativePositionFor = (
  direction: MetricDirection,
  value: number | null,
  mean: number | null,
  criterionBand: ResolvedScaleReference['criterionBand'],
): CognitiveMetricReference['relativePosition'] => {
  if (direction === 'descriptive' || value === null) return 'descriptive'
  if (criterionBand) return 'within_reference'
  if (mean === null) return null
  if (value === mean) return 'within_reference'
  if (direction === 'target_range') return value > mean ? 'above_reference' : 'below_reference'
  return value > mean ? 'above_reference' : 'below_reference'
}

const normalizedValue = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)

const qualityLimitedReference = (reference: ResolvedScaleReference): ResolvedScaleReference => ({
  ...reference,
  evidenceLevel: null,
  status: 'unavailable',
  unavailableReason: 'quality_limited',
  label: '参考暂不可用',
  value: null,
  mean: null,
  sd: null,
  z: null,
  t: null,
  percentile: null,
  criterionBand: null,
  meanDifference: null,
  source: null,
  population: null,
  instrumentVersion: null,
  scoringVersion: null,
  limitations: [],
  disclaimer: '本指标受数据质量限制，当前未使用人口参考。',
})

const missingContextReference = (mapping: ReferenceApplicability): CognitiveMetricReference => ({
  scoreKey: mapping.metricKey,
  referenceVersion: mapping.referenceVersion,
  referenceKind: mapping.referenceKind,
  evidenceLevel: null,
  status: 'unavailable',
  unavailableReason: 'missing_context',
  label: '参考暂不可用',
  value: null,
  mean: null,
  sd: null,
  z: null,
  t: null,
  percentile: null,
  criterionBand: null,
  meanDifference: null,
  source: null,
  population: null,
  instrumentVersion: null,
  scoringVersion: null,
  limitations: [],
  disclaimer: '该指标声明需要额外人口上下文；本次测评未提供匹配上下文。',
  metricKey: mapping.metricKey,
  direction: mapping.direction,
  relativePosition: null,
})

/** Resolve each explicitly declared metric mapping through PR-A's shared core. */
export const resolveCognitiveMetricReferences = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  metrics: Record<string, unknown>
  references: AssessmentReferenceSetDefinition[]
  context?: AssessmentContextV1 | null
  quality?: QualityAssessment | null
}): CognitiveMetricReference[] => {
  if (input.quality?.state === 'invalid') return []
  const context = toReferenceContext(input.context)
  return input.definition.references.flatMap((mapping) => {
    const metric = input.definition.metrics[mapping.metricKey]
    if (!metric) return []
    if (requiredContextMissing(mapping.requiredContext, context)) {
      return [missingContextReference(mapping)]
    }
    const qualityGated = input.quality ? metricIsQualityGated(metric, input.quality) : false
    const value = normalizedValue(input.metrics[mapping.metricKey])
    const resolved = resolveAssessmentReference({
      instrumentType: 'cognitive',
      selections: [{
        scoreKey: mapping.metricKey,
        referenceVersion: mapping.referenceVersion,
        referenceKind: mapping.referenceKind,
      }],
      references: input.references,
      instrumentKey: input.definition.testType,
      instrumentVersion: mapping.instrumentVersion,
      scoringVersion: mapping.scoringVersion,
      score: { key: mapping.metricKey, value, status: value === null ? 'not_calculable' : 'calculated' },
      context,
    })
    return resolved.map((reference) => {
      const effectiveReference = qualityGated ? qualityLimitedReference(reference) : reference
      const relativePosition = !qualityGated && reference.status === 'available'
        ? reference.referenceKind === 'descriptive_sample'
          ? 'descriptive'
          : relativePositionFor(mapping.direction, reference.value, reference.mean, reference.criterionBand)
        : null
      return {
        ...effectiveReference,
        metricKey: mapping.metricKey,
        direction: mapping.direction,
        relativePosition,
      }
    })
  })
}

/**
 * Convert a Prisma AssessmentReferenceSet row into the shared JSON contract.
 * Database identity/status fields are authoritative; the definition cannot
 * change the instrument type or reference version while being consumed.
 */
export const parseCognitiveReferenceSetRow = (row: {
  instrumentType: string
  instrumentKey: string
  referenceVersion: string
  status: string
  definition: unknown
}): AssessmentReferenceSetDefinition => {
  const status = row.status === 'ACTIVE' ? 'ACTIVE' : row.status === 'RETIRED' ? 'RETIRED' : 'DRAFT'
  const definition = row.definition && typeof row.definition === 'object' && !Array.isArray(row.definition)
    ? row.definition as Record<string, unknown>
    : {}
  const checked = validateReferenceSetDefinition({
    ...definition,
    schemaVersion: 1,
    instrumentType: 'cognitive',
    instrumentKey: row.instrumentKey,
    referenceVersion: row.referenceVersion,
    status,
  })
  if (!checked.definition || checked.issues.some((candidate) => candidate.severity === 'error')) {
    throw new Error(`Invalid cognitive reference set ${row.instrumentKey}/${row.referenceVersion}`)
  }
  return checked.definition
}

export const loadCognitiveReferenceSets = async (
  db: { assessmentReferenceSet?: { findMany: (args: unknown) => Promise<unknown[]> } },
  instrumentKey: string,
): Promise<AssessmentReferenceSetDefinition[]> => {
  if (!db.assessmentReferenceSet) return []
  const rows = await db.assessmentReferenceSet.findMany({
    where: { instrumentType: 'COGNITIVE', instrumentKey },
  }) as Array<{
    instrumentType: string
    instrumentKey: string
    referenceVersion: string
    status: string
    definition: unknown
  }>
  return rows.map(parseCognitiveReferenceSetRow)
}
