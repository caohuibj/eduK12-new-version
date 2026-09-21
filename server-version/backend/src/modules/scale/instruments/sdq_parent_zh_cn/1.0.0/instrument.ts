import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { DISCLOSURE_PRESETS } from '../../../policy/disclosure'
import { standardIntendedUse } from '../../catalog-defaults'
import { SDQ_PARENT_ZH_CN_V1_PACKAGE } from '../../../packages/sdq-parent-zh-cn-v1'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'sdq_parent_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Strengths and Difficulties Questionnaire — Parent',
    abbreviation: 'SDQ Parent',
    instrumentFamily: 'Strengths and Difficulties Questionnaire',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SOCIAL_EMOTIONAL', 'PARENT_OBSERVATION'],
    constructDefinition: '家长对儿童或青少年情绪、行为、注意、同伴关系与亲社会行为的观察描述。',
    constructLevel: 'BROAD_DOMAIN',
    constructOverlapTags: ['sdq', 'parent_report', 'multi_domain_observation'],
  },
  population: {
    minAge: 4,
    maxAge: 17,
    populationNotes: '家长观察版本；年龄边界来自既有产品入口与来源工具说明。',
    respondentTypes: ['PARENT'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 25,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SUPERVISED'],
    timeFrame: '过去六个月或本学年',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [],
  },
  intendedUse: standardIntendedUse,
  evidence: [],
  referenceApplicability: [],
}
const localization: LocalizationManifestV1 = {
  ...{
    instrumentKey: catalog.identity.instrumentKey,
    instrumentVersion: catalog.identity.instrumentVersion,
    sourceLocale: 'zh-CN',
    targetLocale: 'zh-CN',
    translationSource: '已授权 SDQ Chinese Simplified parent source',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
  },
  schemaVersion: 1,
  localizationVersion: '1.0.0',
  reviewStatus: 'APPROVED',
  reviewedAt: '2026-09-01T00:00:00Z',
}
const { instrumentKey, instrumentVersion, ...catalogIdentity } = catalog.identity
const { instrumentKey: _lk, instrumentVersion: _lv, ...localizationBody } = localization

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey, instrumentVersion },
  catalog: { ...catalog, identity: catalogIdentity },
  localization: localizationBody,
  applicability: {
    schemaVersion: 1,
    policyVersion: 'pr4-migrated-v1',
    respondentTypes: ['PARENT'],
    subject: { ageMonths: { minInclusive: 48, maxExclusive: 216 } },
    requiredContextKeys: [],
  },
  disclosure: {
    schemaVersion: 1,
    policyVersion: 'legacy-migrated-v1',
    audiences: {
      respondent: DISCLOSURE_PRESETS.FULL_REPORT(),
      subject: DISCLOSURE_PRESETS.FULL_REPORT(),
      teacher: DISCLOSURE_PRESETS.FULL_REPORT(),
      researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
    },
    unknownAudience: 'DENY',
  },
  usageRequirements: {
    schemaVersion: 1,
    policyVersion: 'pr4-migrated-v1',
    requiredRightsActions: ["electronicAdministration","scoring","display"],
    
    notes: ['Migrated from reviewed legacy deployment gates; durable grants remain in InstrumentAuthorization.'],
  },
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: localization.targetLocale,
    definition: SDQ_PARENT_ZH_CN_V1_PACKAGE.definition,
    references: SDQ_PARENT_ZH_CN_V1_PACKAGE.references,
    goldenCases: SDQ_PARENT_ZH_CN_V1_PACKAGE.goldenCases,
  },
} satisfies ScaleInstrumentSourceV1
