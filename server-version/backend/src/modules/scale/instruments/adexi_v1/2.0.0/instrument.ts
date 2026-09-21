import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { DISCLOSURE_PRESETS } from '../../../policy/disclosure'
import { standardIntendedUse } from '../../catalog-defaults'
import { ADEXI_V2_PACKAGE } from '../../../packages/adexi-v2'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'adexi_v1',
    instrumentVersion: '2.0.0',
    canonicalName: 'ADEXI Self-Report',
    abbreviation: 'ADEXI',
    instrumentFamily: 'ADEXI executive-function self-report',
  },
  construct: {
    primaryDomain: 'EXECUTIVE_FUNCTION',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '参与者对工作记忆与抑制相关日常困难的自我描述。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['working_memory', 'inhibition', 'self_report'],
  },
  population: {
    minAge: 18,
    maxAge: 100,
    populationNotes: '当前产品入口沿用成人自评边界；实际部署仍受既有 package gate 与授权范围约束。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'UNKNOWN',
  },
  administration: {
    itemCount: 14,
    estimatedMinutes: 5,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED'],
    timeFrame: '近期日常体验',
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
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: '项目已授权的 ADEXI 中文适配 package',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: '本地化 provenance 仅描述当前部署文本来源；不改变 package scoring identity。',
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
    subject: { ageMonths: { minInclusive: 216, maxExclusive: 1212 } },
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
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: localization.targetLocale,
    definition: ADEXI_V2_PACKAGE.definition,
    references: ADEXI_V2_PACKAGE.references,
    goldenCases: ADEXI_V2_PACKAGE.goldenCases,
  },
} satisfies ScaleInstrumentSourceV1
