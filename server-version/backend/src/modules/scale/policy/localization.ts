import type { ScaleInstrumentSourceV1 } from '../onboarding/types'
import type { ScaleDeploymentPolicyV1 } from './deployment'

export const scaleLocalizationReasons = (source: ScaleInstrumentSourceV1, policy: ScaleDeploymentPolicyV1): string[] => {
  const localization = source.localization
  if (!localization) return ['LOCALIZATION_MISSING']
  const reasons: string[] = []
  if (localization.reviewStatus !== 'APPROVED') reasons.push('LOCALIZATION_REVIEW_PENDING')
  if (localization.targetLocale !== policy.locale) reasons.push('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  if (policy.localizationVersion !== localization.localizationVersion) reasons.push('DEPLOYMENT_LOCALIZATION_VERSION_MISMATCH')
  if (localization.adaptationMethod !== 'ORIGINAL_SOURCE' && localization.expertReviewStatus !== 'COMPLETED') reasons.push('LOCALIZATION_EXPERT_REVIEW_PENDING')
  return reasons
}
