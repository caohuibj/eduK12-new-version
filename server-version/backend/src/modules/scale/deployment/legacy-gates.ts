/** PR-3 compatibility adapter. PR-4 moves these audited restrictions into source data. */
import { evaluateWho5ScalePackageGate, evaluateSdqElectronicAdminGate, evaluateTexiLocalizationGate } from '../scale-package-gates'
import { TEXI_LOCALIZATION_MANIFEST_PENDING } from '../localization/texi-localization-manifest'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import type { ScaleDeploymentPolicyV1 } from '../policy/deployment'

export const legacyDeploymentGateReasons = (key: string, version: string, policy: ScaleDeploymentPolicyV1, authorizations: InstrumentAuthorizationRecordV1[], nowIso?: string): string[] => {
  if (version !== '1.0.0') return []
  const common = { instrumentKey: key, instrumentVersion: version, authorizations, locale: policy.locale, territory: policy.territory, nowIso }
  if (key === 'who5') return evaluateWho5ScalePackageGate({ ...common, deploymentCommercialNature: policy.commercialNature }).errors
  if (key === 'sdq_parent_zh_cn' || key === 'sdq_teacher_zh_cn') return evaluateSdqElectronicAdminGate({ ...common, allowEnglishTeacherSource: policy.locale === 'en' }).errors
  if (key === 'texi_parent_zh_cn' || key === 'texi_teacher_zh_cn') return evaluateTexiLocalizationGate({ ...common, localizationManifest: TEXI_LOCALIZATION_MANIFEST_PENDING }).errors
  return []
}
