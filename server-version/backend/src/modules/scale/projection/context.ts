import {
  denyAllDisclosureCapabilities,
  intersectDisclosureCapabilities,
  resolveAudienceDisclosure,
} from '../policy/disclosure'
import type { DisclosureCapabilitiesV1 } from '../policy/types'
import type { ScaleProjectionContext } from './types'

const relationalCeiling = (context: ScaleProjectionContext): DisclosureCapabilitiesV1 => (
  context.relationalDisposition === 'COHORT_ONLY'
    ? denyAllDisclosureCapabilities()
    : context.accessDecision.capabilities
)

/**
 * Effective visibility is an intersection. Every additional restriction can
 * only remove capabilities; it can never widen an instrument policy.
 */
export const resolveEffectiveScaleDisclosure = (
  context: ScaleProjectionContext,
): DisclosureCapabilitiesV1 => {
  if (!context.accessDecision.allowed) return denyAllDisclosureCapabilities()
  if (context.frozenPolicy.disposition === 'UNKNOWN') return denyAllDisclosureCapabilities()
  return intersectDisclosureCapabilities(
    resolveAudienceDisclosure(context.frozenPolicy.disclosure, context.audience),
    context.accessDecision.capabilities,
    context.currentRestrictions,
    relationalCeiling(context),
  )
}
