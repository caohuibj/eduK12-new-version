import { resolveAssessmentReference, validateReferenceSetDefinition, type AssessmentReferenceSetDefinition, type ReferenceContext, type ResolvedScaleReference } from '../../assessment-reference/reference'
import type { AssessmentContextV1 } from '../../assessment-context'
import type { MetricDirection, TaskDefinition } from './types'

export interface CognitiveMetricReference extends ResolvedScaleReference {
  metricKey: string
  direction: MetricDirection
  /** Direction-aware interpretation for UI/report consumers. */
  relativePosition: 'above_reference' | 'below_reference' | 'within_reference' | 'descriptive' | null
}

const toReferenceContext = (context: AssessmentContextV1 | null | undefined): ReferenceContext => (
  context?.values ?? {}
)

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

/** Resolve each explicitly declared metric mapping through PR-A's shared core. */
export const resolveCognitiveMetricReferences = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  metrics: Record<string, unknown>
  references: AssessmentReferenceSetDefinition[]
  context?: AssessmentContextV1 | null
}): CognitiveMetricReference[] => input.definition.references.flatMap((mapping) => {
  const metric = input.definition.metrics[mapping.metricKey]
  if (!metric) return []
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
    context: toReferenceContext(input.context),
  })
  return resolved.map((reference) => ({
    ...reference,
    metricKey: mapping.metricKey,
    direction: mapping.direction,
    relativePosition: reference.status === 'available'
      ? relativePositionFor(mapping.direction, reference.value, reference.mean, reference.criterionBand)
      : null,
  }))
})

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
