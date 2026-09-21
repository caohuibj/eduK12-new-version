import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { researchFirstUse } from '../../catalog-defaults'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'REVIEWED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'mpfi24_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Multidimensional Psychological Flexibility Inventory — 24-item Chinese Short Form',
    abbreviation: 'MPFI-24',
    instrumentFamily: 'Multidimensional Psychological Flexibility Inventory',
  },
  construct: {
    primaryDomain: 'SELF_REGULATION',
    secondaryDomains: ['WELL_BEING'],
    constructDefinition: '基于 ACT 六过程框架评估心理灵活性与心理僵化/不灵活性的多维自我报告。',
    constructLevel: 'BROAD_DOMAIN',
    constructOverlapTags: ['psychological_flexibility', 'psychological_inflexibility', 'act', 'self_report'],
  },
  population: {
    populationNotes: '2024 中国验证覆盖中学生、大学生、大学教师与医疗专业人员，总有效样本 N=3,568；大学生一月重测 n=350。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'ESTABLISHED',
  },
  administration: {
    itemCount: 24,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '按量表原始时间框架执行；exact-form package 冻结前不得自行改写',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: ['当前仅建立 scientific catalog；简体中文 exact-form 条目、计分映射与再分发/数字使用 provenance 未闭环前不得生成可执行 package。'],
  },
  intendedUse: researchFirstUse,
  evidence: [
    {
      evidenceId: 'mpfi24-cn-fang-2024',
      evidenceType: 'MEASUREMENT_INVARIANCE',
      population: '中国中学生、大学生、大学教师、医疗专业人员',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 3568,
      studyDesign: 'CFA + correlation/regression + network analysis + one-month retest + invariance analyses',
      rating: 'SUFFICIENT',
      citation: 'Fang S, Huang M, Ding D, Zheng Q. (2024). The Chinese version of the multidimensional psychological flexibility inventory short form (MPFI-24): Assessment of psychometric properties using classical test theory and network analysis. Journal of Contextual Behavioral Science, 33, 100805.',
      doi: '10.1016/j.jcbs.2024.100805',
      url: 'https://doi.org/10.1016/j.jcbs.2024.100805',
      notes: '有效样本 N=3,568；一月重测 n=350；支持跨四类人群与性别测量等值。',
    },
  ],
  referenceApplicability: [],
}
const localization: LocalizationManifestV1 = {
  ...{
    instrumentKey: catalog.identity.instrumentKey,
    instrumentVersion: catalog.identity.instrumentVersion,
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'Fang et al. (2024) C-MPFI-24 validation; exact item/scoring attachment provenance must be frozen before package creation.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['mpfi24-cn-fang-2024'],
    notes: 'Catalog-only until exact-form content and digital/redistribution rights are verified.',
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
  candidatePreview: {
    status: 'CATALOG_ONLY',
    blockers: ['EXECUTABLE_NOT_REGISTERED'],
  },
} satisfies ScaleInstrumentSourceV1
