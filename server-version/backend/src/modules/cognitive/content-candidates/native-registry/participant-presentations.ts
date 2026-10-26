import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { ENUMERATION_RECIPE_IDENTITY } from '../enumeration/protocol'
import { createEnumerationParticipantPresentation } from '../enumeration/participant-presentation'
export interface NativePresentationIdentity {
  testType: string; engineVersion: string; scoringVersion: string; configVersion: string
}
/** Factories keep every freeze independent; a mutated snapshot can never leak into the next assignment. */
const factories: Array<{ identity: NativePresentationIdentity; create: () => CognitiveParticipantPresentationV1 }> = [{
  identity: {
    testType: ENUMERATION_RECIPE_IDENTITY.testType,
    engineVersion: ENUMERATION_RECIPE_IDENTITY.engineVersion,
    scoringVersion: ENUMERATION_RECIPE_IDENTITY.scoringVersion,
    configVersion: ENUMERATION_RECIPE_IDENTITY.configVersion,
  },
  create: createEnumerationParticipantPresentation,
}]
/**
 * Exact tuple only, for native tasks that have no legacy RegistryEntry to read a presentation from.
 * An unregistered identity returns undefined and keeps the previous no-presentation behaviour.
 */
export function resolveNativeParticipantPresentation(identity: NativePresentationIdentity): CognitiveParticipantPresentationV1 | undefined {
  const entry = factories.find(item => item.identity.testType === identity.testType
    && item.identity.engineVersion === identity.engineVersion
    && item.identity.scoringVersion === identity.scoringVersion
    && item.identity.configVersion === identity.configVersion)
  return entry ? entry.create() : undefined
}
