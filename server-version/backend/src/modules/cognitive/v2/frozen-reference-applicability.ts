import { z } from 'zod'
import type { ReferenceBindingSnapshot } from '../../assessment-runtime/types'
import type { ReferenceApplicability, TaskDefinition } from './types'

const uniqueStrings = (values: string[]): boolean => new Set(values).size === values.length

const frozenReferenceApplicabilitySchema = z.object({
  metricKey: z.string().min(1),
  referenceVersion: z.string().min(1),
  referenceKind: z.enum(['normative_distribution', 'criterion_threshold', 'descriptive_sample']),
  evidenceLevel: z.enum(['literature_beta', 'local_pilot', 'local_norm', 'validated_norm']),
  instrumentVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  direction: z.enum(['higher_is_better', 'lower_is_better', 'target_range', 'descriptive', 'signed']),
  profiles: z.array(z.enum(['experience', 'standard', 'research'])).min(1)
    .refine(uniqueStrings, 'profiles must be unique'),
  resolvedConfigHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1)
    .refine(uniqueStrings, 'resolvedConfigHashes must be unique'),
  requiredContext: z.array(z.enum(['age', 'sexAtBirth', 'gradeLevel', 'primaryLanguage', 'countryOrRegion']))
    .refine(uniqueStrings, 'requiredContext must be unique')
    .optional(),
}).strict()

const mappingFromBinding = <TConfig, TTrial>(
  definition: TaskDefinition<TConfig, TTrial>,
  binding: ReferenceBindingSnapshot,
): ReferenceApplicability => {
  if (!binding.applicability) {
    throw new Error(`Frozen Cognitive reference ${binding.referenceVersion}/${binding.scoreKey ?? 'unknown'} is missing applicability`)
  }
  const mapping = frozenReferenceApplicabilitySchema.parse(binding.applicability) as ReferenceApplicability
  if (
    mapping.metricKey !== binding.scoreKey
    || mapping.referenceVersion !== binding.referenceVersion
    || mapping.referenceKind !== binding.referenceKind
  ) {
    throw new Error(`Frozen Cognitive reference ${binding.referenceVersion}/${binding.scoreKey ?? 'unknown'} applicability identity mismatch`)
  }
  const metric = definition.metrics[mapping.metricKey]
  if (!metric) {
    throw new Error(`Frozen Cognitive reference mapping uses unknown metric ${mapping.metricKey}`)
  }
  if (mapping.instrumentVersion !== definition.engineVersion || mapping.scoringVersion !== definition.scoringVersion) {
    throw new Error(`Frozen Cognitive reference ${mapping.referenceVersion}/${mapping.metricKey} version identity mismatch`)
  }
  if (mapping.direction !== metric.direction) {
    throw new Error(`Frozen Cognitive reference ${mapping.referenceVersion}/${mapping.metricKey} direction identity mismatch`)
  }
  return mapping
}

/**
 * Rebuild only the reference-mapping portion of a Cognitive TaskDefinition from
 * the attempt's frozen binding snapshots. This prevents later registry mapping
 * edits from changing the reference semantics of an already-started attempt.
 *
 * Frozen mappings are intentionally validated independently from current
 * publication/reference-eligibility governance: later governance changes must
 * not retroactively rewrite a historical attempt. Scorer/version/metric
 * identity still has to match the exact task identity used by the attempt.
 *
 * Historical attempts with zero frozen bindings remain reference-free even if
 * the current exact task identity later gains production reference mappings.
 */
export const withFrozenCognitiveReferenceApplicability = <TConfig, TTrial>(
  definition: TaskDefinition<TConfig, TTrial>,
  bindings: ReferenceBindingSnapshot[],
): TaskDefinition<TConfig, TTrial> => ({
  ...definition,
  references: bindings.map((binding) => mappingFromBinding(definition, binding)),
})
