import { DISCLOSURE_PRESETS } from './disclosure'
import type { AudienceDisclosurePolicyV1, InstrumentApplicabilityV1, ScalePolicyRespondentType } from './types'

export interface LegacyInstrumentCompatibilityProfile {
  profileVersion: 'legacy-scale-compat-v1'
  identity: { instrumentKey: string; instrumentVersion: string }
  applicability: InstrumentApplicabilityV1
  disclosure: AudienceDisclosurePolicyV1
  eligibilityDisposition: 'LEGACY_NOT_EVALUATED'
  preserveExistingAccessRestrictions: true
}

const profile = (
  instrumentKey: string,
  instrumentVersion: string,
  respondentTypes: ScalePolicyRespondentType[],
): LegacyInstrumentCompatibilityProfile => ({
  profileVersion: 'legacy-scale-compat-v1',
  identity: { instrumentKey, instrumentVersion },
  applicability: {
    schemaVersion: 1,
    policyVersion: 'legacy-compat-v1',
    respondentTypes,
    requiredContextKeys: [],
  },
  disclosure: {
    schemaVersion: 1,
    policyVersion: 'legacy-compat-v1',
    audiences: {
      respondent: DISCLOSURE_PRESETS.FULL_REPORT(),
      subject: DISCLOSURE_PRESETS.FULL_REPORT(),
      teacher: DISCLOSURE_PRESETS.FULL_REPORT(),
      researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
    },
    unknownAudience: 'DENY',
  },
  eligibilityDisposition: 'LEGACY_NOT_EVALUATED',
  preserveExistingAccessRestrictions: true,
})

const profiles: readonly LegacyInstrumentCompatibilityProfile[] = [
  profile('adexi_v1', '2.0.0', ['SELF']),
  profile('who5', '1.0.0', ['SELF']),
  profile('sdq_parent_zh_cn', '1.0.0', ['PARENT']),
  profile('sdq_teacher_zh_cn', '1.0.0', ['TEACHER']),
  profile('texi_parent_zh_cn', '1.0.0', ['PARENT']),
  profile('texi_teacher_zh_cn', '1.0.0', ['TEACHER']),
]

const profileByIdentity = new Map<string, LegacyInstrumentCompatibilityProfile>()
profiles.forEach((entry) => {
  const key = `${entry.identity.instrumentKey}:${entry.identity.instrumentVersion}`
  if (profileByIdentity.has(key)) throw new Error(`Duplicate legacy Scale compatibility profile: ${key}`)
  profileByIdentity.set(key, entry)
})

export const listLegacyScaleCompatibilityProfiles = (): LegacyInstrumentCompatibilityProfile[] => [...profiles]

export const getLegacyScaleCompatibilityProfile = (
  instrumentKey: string,
  instrumentVersion: string,
): LegacyInstrumentCompatibilityProfile | undefined => profileByIdentity.get(`${instrumentKey}:${instrumentVersion}`)
