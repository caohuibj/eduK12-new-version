import {
  hashSituationDefinition,
  runnerSituationDefinition,
  situationDefinitionSchema,
  validateSituationDefinition,
  type SituationDefinitionV1,
  type SituationDefinitionValidationOptions,
} from './situation-definition'
import {
  hashSituationDefinitionV2,
  runnerBranchingSituationDefinition,
  situationDefinitionV2Schema,
  validateBranchingSituationDefinition,
  type SituationDefinitionV2,
} from './situation-branching'

export type SituationRuntimeDefinition = SituationDefinitionV1 | SituationDefinitionV2

export const isBranchingSituationDefinition = (
  definition: SituationRuntimeDefinition,
): definition is SituationDefinitionV2 => definition.schemaVersion === 2

/**
 * V2 adds delivery/traversal semantics only. Scoring and scientific metadata
 * remain the V1 plane, so authoritative scorers can reuse the existing engine
 * after traversal has selected the reachable scenes.
 */
export const asLinearSituationDefinition = (
  definition: SituationRuntimeDefinition,
): SituationDefinitionV1 => {
  if (definition.schemaVersion === 1) return definition
  const {
    flow: _flow,
    schemaVersion: _schemaVersion,
    sampling: _sampling,
    ...rest
  } = definition
  return { ...rest, schemaVersion: 1, sampling: { strategy: 'ALL' } }
}

export const validateSituationRuntimeDefinition = (
  value: unknown,
  options: SituationDefinitionValidationOptions = {},
) => {
  const schemaVersion = value && typeof value === 'object'
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined
  return schemaVersion === 2
    ? validateBranchingSituationDefinition(value, options)
    : validateSituationDefinition(value, options)
}

export const parseSituationRuntimeDefinition = (value: unknown): SituationRuntimeDefinition => {
  const schemaVersion = value && typeof value === 'object'
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined
  return schemaVersion === 2
    ? situationDefinitionV2Schema.parse(value)
    : situationDefinitionSchema.parse(value)
}

export const hashSituationRuntimeDefinition = (definition: SituationRuntimeDefinition): string => (
  definition.schemaVersion === 2
    ? hashSituationDefinitionV2(definition)
    : hashSituationDefinition(definition)
)

export const runnerSituationRuntimeDefinition = (definition: SituationRuntimeDefinition) => (
  definition.schemaVersion === 2
    ? runnerBranchingSituationDefinition(definition)
    : runnerSituationDefinition(definition)
)
