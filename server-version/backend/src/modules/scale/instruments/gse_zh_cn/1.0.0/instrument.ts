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
    instrumentKey: 'gse_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'General Self-Efficacy Scale — Chinese Adaptation',
    abbreviation: 'GSE',
    instrumentFamily: 'General Self-Efficacy Scale',
  },
  construct: {
    primaryDomain: 'SELF_EFFICACY',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '个体对自己能够应对困难、意外与挑战性要求的总体效能信念。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['general_self_efficacy', 'agency', 'coping', 'self_report'],
  },
  population: {
    populationNotes: '中国大陆大型验证 N=9,578，覆盖小学、初/高中阶段学校与大学样本；其中学校样本 n=8,164，平均年龄 14.41（SD=3.70）。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'ESTABLISHED',
  },
  administration: {
    itemCount: 10,
    estimatedMinutes: 4,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '一般/日常自我看法',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: ['官方许可允许非商业研究与受限登录在线研究，但禁止把完整量表公开发布到互联网；部署必须通过授权 scope 审核。'],
  },
  intendedUse: researchFirstUse,
  evidence: [
    {
      evidenceId: 'gse-cn-zhang-1995',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '中国样本（早期中文适配研究）',
      locale: 'zh-CN',
      territory: 'CN',
      studyDesign: 'Chinese adaptation and psychometric evaluation',
      rating: 'SUFFICIENT',
      citation: 'Zhang JX, Schwarzer R. (1995). Measuring optimistic self-beliefs: A Chinese adaptation of the General Self-Efficacy Scale. Psychologia, 38(3), 174-181.',
    },
    {
      evidenceId: 'gse-cn-zeng-2020',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '中国大陆小学、初/高中阶段学校与大学学生',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 9578,
      studyDesign: 'Three cross-sectional studies; EFA + CFA + internal consistency + criterion validity',
      rating: 'SUFFICIENT',
      citation: 'Zeng G, Fung SF, Li J, Hussain N, Yu P. (2020/2022). Evaluating the psychometric properties and factor structure of the general self-efficacy scale in China. Current Psychology, 41, 3970-3980.',
      doi: '10.1007/s12144-020-00924-9',
      url: 'https://doi.org/10.1007/s12144-020-00924-9',
      notes: '总样本 N=9,578；学校样本 n=8,164，大学样本另行纳入。研究支持两因子结构，同时原工具常被作为总分工具使用；package 设计前必须冻结 canonical scoring 解释。',
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
    translationSource: 'Zhang & Schwarzer Chinese adaptation (1995) + mainland China validation literature; exact runtime form pending rights-safe freeze.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['gse-cn-zhang-1995', 'gse-cn-zeng-2020'],
    notes: 'Official GSE permission restricts open Internet publication; catalog entry does not expose protected item text.',
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
    source: {
  title: 'General Self-Efficacy Scale (GSE)',
  citation: 'Schwarzer, R., & Jerusalem, M. (1995). Generalized Self-Efficacy Scale. In J. Weinman, S. Wright, & M. Johnston (Eds.), Measures in Health Psychology: A User’s Portfolio.',
  url: 'https://userpage.fu-berlin.de/health/selfscal.htm',
  publicationYear: 1995
},
    reportPlan: {
  dimensionLabels: [
    '一般自我效能'
  ],
  limitations: [
    '当前仅为报告设计；exact-form 中文文本、canonical scoring 与受限在线使用条件尚未冻结为 runtime package。',
    '自我效能是自我报告信念，不等同于智力、学业成绩、执行功能任务表现或客观能力。',
    '不提供群体百分位或常模判断。'
  ],
  disclaimer: '计划报告描述个体对困难与挑战的总体应对信念，不用于诊断、能力鉴定或高风险决策。'
},
    blockers: [
  'EXECUTABLE_NOT_REGISTERED'
],
  },
} satisfies ScaleInstrumentSourceV1
