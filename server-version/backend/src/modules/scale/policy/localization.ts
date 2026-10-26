import type { ScaleInstrumentSourceV1 } from '../onboarding/types'
import type { ScaleDeploymentPolicy } from './deployment'

export const scaleLocalizationReasons = (source: ScaleInstrumentSourceV1, policy: ScaleDeploymentPolicy): string[] => {
  const localization = source.localization
  if (!localization) return ['LOCALIZATION_MISSING']
  const reasons: string[] = []
  // Returned translations stay blocked with their own reason: the wording was
  // explicitly rejected and must be revised and re-reviewed, not silently
  // retried as if merely pending.
  if (localization.reviewStatus === 'RETURNED') reasons.push('LOCALIZATION_REVIEW_RETURNED')
  else if (localization.reviewStatus !== 'APPROVED') reasons.push('LOCALIZATION_REVIEW_PENDING')
  if (localization.targetLocale !== policy.locale) reasons.push('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  if (policy.localizationVersion !== localization.localizationVersion) reasons.push('DEPLOYMENT_LOCALIZATION_VERSION_MISMATCH')
  if (localization.adaptationMethod !== 'ORIGINAL_SOURCE' && localization.expertReviewStatus !== 'COMPLETED') reasons.push(localization.expertReviewStatus === 'RETURNED' ? 'LOCALIZATION_EXPERT_REVIEW_RETURNED' : 'LOCALIZATION_EXPERT_REVIEW_PENDING')
  return reasons
}

/** Management-facing disposition for each localization blocker: where it
 * comes from and the concrete next action, so a pending/returned version can
 * be driven forward without reading SQL or guessing at owners. */
export const localizationNextActions: Record<string, { stage: string; owner: string; next: string }> = {
  LOCALIZATION_MISSING: { stage: '本地化清单', owner: '内容线', next: '为该精确版本补 localization 清单后重新导入' },
  LOCALIZATION_REVIEW_PENDING: { stage: '译文治理审核', owner: '本地化治理审核人', next: '完成审核并记录 reviewedAt；提交审核证据（evidenceIds）后置为 APPROVED' },
  LOCALIZATION_REVIEW_RETURNED: { stage: '译文治理审核', owner: '内容线', next: '按退回原因修订译文并递增 localizationVersion，再次送审' },
  DEPLOYMENT_CONTENT_LOCALE_MISMATCH: { stage: '部署策略', owner: '平台管理员', next: '核对目标 locale 与 manifest.targetLocale 是否一致' },
  DEPLOYMENT_LOCALIZATION_VERSION_MISMATCH: { stage: '部署策略', owner: '平台管理员', next: '将部署策略的 localizationVersion 更新为 manifest 的精确版本' },
  LOCALIZATION_EXPERT_REVIEW_PENDING: { stage: '专家译校', owner: '专家审校人', next: '非 ORIGINAL_SOURCE 译稿须完成专家审校并记录 evidenceIds' },
  LOCALIZATION_EXPERT_REVIEW_RETURNED: { stage: '专家译校', owner: '内容线', next: '按退回原因修订并递增 localizationVersion，再次送审' },
}
