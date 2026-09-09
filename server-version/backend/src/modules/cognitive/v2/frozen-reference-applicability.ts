import type { ReferenceBindingSnapshot } from '../../assessment-runtime/types'
import { validateTaskDefinition } from './publication-gate'
import type { ReferenceApplicability, TaskDefinition } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const mappingFromBinding = (binding: ReferenceBindingSnapshot): ReferenceApplicability => {
  if (!isRecord(binding.applicability)) {
    throw new Error(`Frozen Cognitive reference ${binding.referenceVersion}/${binding.scoreKey ?? 'unknown'} is missing applicability`)
  }
  const mapping = binding.applicability as unknown as ReferenceApplicability
  if (
    mapping.metricKey !== binding.scoreKey
    || mapping.referenceVersion !== binding.referenceVersion
    || mapping.referenceKind !== binding.referenceKind
  ) {
    throw new Error(`Frozen Cognitive reference ${binding.referenceVersion}/${binding.scoreKey ?? 'unknown'} applicability identity mismatch`)
  }
  return mapping
}

/**
 * Rebuild only the reference-mapping portion of a Cognitive TaskDefinition from
 * the attempt's frozen binding snapshots. This prevents later registry mapping
 * edits from changing the reference semantics of an already-started attempt.
 *
 * Historical attempts with zero frozen bindings remain reference-free even if
 * the current exact task identity later gains production reference mappings.
 */
export const withFrozenCognitiveReferenceApplicability = <TConfig, TTrial>(
  definition: TaskDefinition<TConfig, TTrial>,
  bindings: ReferenceBindingSnapshot[],
): TaskDefinition<TConfig, TTrial> => {
  const references = bindings.map(mappingFromBinding)
  const frozenDefinition: TaskDefinition<TConfig, TTrial> = {
    ...definition,
    references,
  }
  const errors = validateTaskDefinition(frozenDefinition).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Frozen Cognitive reference applicability is invalid: ${errors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  return frozenDefinition
}
