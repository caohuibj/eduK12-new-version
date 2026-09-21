import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { DISCLOSURE_PRESETS } from '../../../policy/disclosure'
import { standardIntendedUse } from '../../catalog-defaults'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../../packages/who5-zh-cn-v1'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    canonicalName: 'WHO-5 Well-Being Index',
    abbreviation: 'WHO-5',
    instrumentFamily: 'WHO-5 Well-Being Index family',
  },
  construct: {
    primaryDomain: 'WELL_BEING',
    secondaryDomains: [],
    constructDefinition: '参与者对过去两周身心健康相关良好感受的描述。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['well_being', 'self_report', 'recent_experience'],
  },
  population: {
    minAge: 9,
    maxAge: 18,
    gradeRange: { minGrade: 3, maxGrade: 12 },
    populationNotes: 'Wave 0 沿用本产品青少年自评入口边界；不把分数解释为诊断或中国常模。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 5,
    estimatedMinutes: 3,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED'],
    timeFrame: '过去两周',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [],
  },
  intendedUse: standardIntendedUse,
  evidence: [
    {
      evidenceId: 'who5-cn-fung-2022',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '中国大陆大学本科生（广东高校，两项横断面研究）',
      ageRange: 'Study 1 mean 20.56 years; Study 2 mean 20.41 years',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1414,
      studyDesign: 'Two cross-sectional psychometric studies; internal consistency, EFA/CFA, concurrent and construct validity',
      rating: 'SUFFICIENT',
      citation: 'Fung SF, Kong CYW, Liu YM, et al. (2022). Validity and Psychometric Evaluation of the Chinese Version of the 5-Item WHO Well-Being Index. Frontiers in Public Health, 10, 872436.',
      doi: '10.3389/fpubh.2022.872436',
      url: 'https://doi.org/10.3389/fpubh.2022.872436',
      notes: 'Study 1 n=903, Study 2 n=511. 该核心大陆 validation 直接支持大学生/青年成人，不直接验证当前产品 9–18 岁 K-12 入口。',
    },
  ],
  referenceApplicability: [],
}
const localization: LocalizationManifestV1 = {
  ...{
    instrumentKey: catalog.identity.instrumentKey,
    instrumentVersion: catalog.identity.instrumentVersion,
    sourceLocale: 'zh-CN',
    targetLocale: 'zh-CN',
    translationSource: 'WHO 官方 Chinese PR 字符版本',
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
    respondentTypes: ['SELF'],
    subject: { ageMonths: { minInclusive: 108, maxExclusive: 228 }, grades: ["3","4","5","6","7","8","9","10","11","12"] },
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
    allowedCommercialNatures: ["NON_COMMERCIAL"],
    notes: ['Migrated from reviewed legacy deployment gates; durable grants remain in InstrumentAuthorization.'],
  },
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: localization.targetLocale,
    definition: WHO5_ZH_CN_V1_PACKAGE.definition,
    references: WHO5_ZH_CN_V1_PACKAGE.references,
    goldenCases: WHO5_ZH_CN_V1_PACKAGE.goldenCases,
  },
} satisfies ScaleInstrumentSourceV1
