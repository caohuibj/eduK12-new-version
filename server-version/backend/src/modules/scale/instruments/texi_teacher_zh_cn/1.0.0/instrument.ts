import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { DISCLOSURE_PRESETS } from '../../../policy/disclosure'
import { standardIntendedUse } from '../../catalog-defaults'
import { TEXI_TEACHER_EN_V1_PACKAGE } from '../../../packages/texi-en-v1'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'texi_teacher_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Teenage Executive Functioning Inventory — Teacher',
    abbreviation: 'TEXI Teacher',
    instrumentFamily: 'Teenage Executive Functioning Inventory',
  },
  construct: {
    primaryDomain: 'EXECUTIVE_FUNCTION',
    secondaryDomains: ['TEACHER_OBSERVATION'],
    constructDefinition: '教师对青少年工作记忆与抑制相关执行功能表现的观察描述。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['texi', 'teacher_report', 'working_memory', 'inhibition'],
  },
  population: {
    minAge: 13,
    maxAge: 19,
    populationNotes: '英文教师观察版本；当前部署不提供未经签署的 zh-CN 文本。',
    respondentTypes: ['TEACHER'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 20,
    estimatedMinutes: 10,
    administrationModes: ['DIGITAL_SUPERVISED'],
    timeFrame: '近期日常观察',
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
    targetLocale: 'en',
    translationSource: 'TEXI English teacher source form',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: 'zh-CN localization is not represented by this manifest and remains blocked by the existing gate.',
  },
  schemaVersion: 1,
  localizationVersion: '1.0.0',
  reviewStatus: 'PENDING',
  
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
    respondentTypes: ['TEACHER'],
    subject: { ageMonths: { minInclusive: 156, maxExclusive: 240 } },
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
    requiredRightsActions: ["electronicAdministration","scoring","translation","display"],
    
    notes: ['Migrated from reviewed legacy deployment gates; durable grants remain in InstrumentAuthorization.'],
  },
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: localization.targetLocale,
    definition: TEXI_TEACHER_EN_V1_PACKAGE.definition,
    references: TEXI_TEACHER_EN_V1_PACKAGE.references,
    goldenCases: TEXI_TEACHER_EN_V1_PACKAGE.goldenCases,
  },
} satisfies ScaleInstrumentSourceV1
