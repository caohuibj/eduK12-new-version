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
    instrumentKey: 'pss10_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Perceived Stress Scale — 10-item Simplified Chinese',
    abbreviation: 'PSS-10',
    instrumentFamily: 'Perceived Stress Scale',
  },
  construct: {
    primaryDomain: 'SELF_REGULATION',
    secondaryDomains: ['WELL_BEING'],
    constructDefinition: '个体在最近一个月中对生活不可预测、不可控制与负荷过重程度的主观感受。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['perceived_stress', 'uncontrollability', 'overload', 'self_report'],
  },
  population: {
    minAge: 17,
    maxAge: 20,
    populationNotes: '核心简体中文 validation 为上海交通大学本科生 N=1,096，平均年龄 18.3（SD=0.7）；该证据不能自动外推到 K-12。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 10,
    estimatedMinutes: 5,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '过去一个月',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: ['Carnegie Mellon 当前要求经 MAPI/ePROVIDE 提交使用许可；中文翻译还可能存在译者权利。授权证据未落库前不得生成或部署完整 package。'],
  },
  intendedUse: researchFirstUse,
  evidence: [
    {
      evidenceId: 'pss10-cn-lu-2017',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '上海交通大学本科生',
      ageRange: 'mean 18.3 years (SD 0.7)',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1096,
      studyDesign: 'EFA + CFA + concurrent validity + two-week test-retest (n=129)',
      rating: 'SUFFICIENT',
      citation: 'Lu W, Bian Q, Wang W, Wu X, Wang Z, Zhao M. (2017). Chinese version of the Perceived Stress Scale-10: A psychometric study in Chinese university students. PLOS ONE, 12(12), e0189543.',
      doi: '10.1371/journal.pone.0189543',
      url: 'https://doi.org/10.1371/journal.pone.0189543',
      notes: 'Cronbach alpha .85；两周重测 .70；不提供诊断 cut-off。',
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
    translationSource: 'Lu et al. (2017) Simplified Chinese PSS-10 validation; final runtime text requires permission/provenance review.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['pss10-cn-lu-2017'],
    notes: 'MAPI/ePROVIDE and translation-rights evidence must be recorded before executable package creation.',
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
