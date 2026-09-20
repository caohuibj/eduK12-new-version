import type { LocalizationManifestV1 } from './localization-manifest'
import type { ScaleCatalogManifestV1 } from './catalog-manifest'

/**
 * Wave 1 P1 catalog-first entries.
 *
 * These instruments are scientifically prioritized and have Simplified Chinese
 * evidence, but they deliberately remain REVIEWED rather than ACCEPTED until a
 * rights-safe, exact-form executable package exists. Library discovery must not
 * imply launchability.
 */

const forbiddenUses = [
  'DIAGNOSIS' as const,
  'HIGH_STAKES_SELECTION' as const,
  'SCHOOL_RANKING' as const,
  'TEACHER_ACCOUNTABILITY' as const,
  'UNSUPPORTED_GROUP_COMPARISON' as const,
]

const researchFirstUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'INDIVIDUAL_REFLECTION' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '需在 exact-form package 与 respondent-facing feedback 规则闭环后再开放。' },
    { use: 'PROGRESS_MONITORING' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '重复测量解释必须结合目标人群证据与纵向安全规则。' },
  ],
  forbiddenUses,
}

const dass21: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'REVIEWED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'dass21_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Depression Anxiety Stress Scales — 21-item, Simplified Chinese',
    abbreviation: 'DASS-21',
    instrumentFamily: 'Depression Anxiety Stress Scales',
  },
  construct: {
    primaryDomain: 'SOCIAL_EMOTIONAL',
    secondaryDomains: ['WELL_BEING'],
    constructDefinition: '过去一周抑郁、焦虑与紧张/压力相关负性情绪体验的自我报告。',
    constructLevel: 'BROAD_DOMAIN',
    constructOverlapTags: ['psychological_distress', 'depression', 'anxiety', 'stress', 'self_report'],
  },
  population: {
    gradeRange: { minGrade: 1, maxGrade: 9 },
    populationNotes: '中国 2023 直接验证样本包含 1,507 名小学生与 1,131 名中学生；DASS-Y 的区分效度优于 DASS-21，因此儿童青少年报告不得把三个分量表过度解释为彼此独立的临床障碍。成人/大学生另有中国验证证据。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 21,
    estimatedMinutes: 7,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '过去一周',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: ['不得在公开网站/App中无条件开放施测；respondent-facing 自动解释必须符合 DASS 官方使用限制。'],
  },
  intendedUse: researchFirstUse,
  evidence: [
    {
      evidenceId: 'dass21-cn-wang-2016',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '中国大学生；另含精神分裂症患者与健康对照样本',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1815,
      studyDesign: 'Cross-cultural psychometric validation; CFA and reliability/validity analyses',
      rating: 'SUFFICIENT',
      citation: 'Wang K, Shi HS, Geng FL, et al. (2016). Cross-cultural validation of the Depression Anxiety Stress Scale-21 in China. Psychological Assessment, 28, e88-e100.',
      doi: '10.1037/pas0000207',
      notes: 'sampleSize 记录主大学生样本；研究另含临床与健康对照。',
    },
    {
      evidenceId: 'dass21-cn-cao-2023',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '中国小学与初中学生',
      ageRange: 'primary and middle school',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 2638,
      studyDesign: 'Rasch analysis + CFA + SEM comparing DASS-Y and DASS-21',
      rating: 'MIXED',
      citation: 'Cao CH, Liao XL, Gamble JH, et al. (2023). Evaluating the psychometric properties of the Chinese Depression Anxiety Stress Scale for Youth (DASS-Y) and DASS-21. Child and Adolescent Psychiatry and Mental Health, 17, 106.',
      doi: '10.1186/s13034-023-00655-2',
      url: 'https://doi.org/10.1186/s13034-023-00655-2',
      notes: '1,507 primary + 1,131 middle-school students. Three-factor structure/reliability were acceptable, but discriminant validity was weak and DASS-Y performed better.',
    },
  ],
  referenceApplicability: [],
}

const gse: ScaleCatalogManifestV1 = {
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

const mpfi24: ScaleCatalogManifestV1 = {
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

const pss10: ScaleCatalogManifestV1 = {
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

export const WAVE1_P1_SCALE_CATALOG_MANIFESTS: readonly ScaleCatalogManifestV1[] = [
  dass21,
  gse,
  mpfi24,
  pss10,
]

const pendingLocalization = (input: Omit<LocalizationManifestV1, 'schemaVersion' | 'localizationVersion' | 'reviewStatus'>): LocalizationManifestV1 => ({
  ...input,
  schemaVersion: 1,
  localizationVersion: '1.0.0',
  reviewStatus: 'PENDING',
})

export const WAVE1_P1_LOCALIZATION_MANIFESTS: readonly LocalizationManifestV1[] = [
  pendingLocalization({
    instrumentKey: 'dass21_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'DASS official Chinese resources + China validation literature; exact runtime Simplified Chinese form remains to be frozen.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['dass21-cn-wang-2016', 'dass21-cn-cao-2023'],
    notes: 'Catalog provenance only; no executable item text is represented by this manifest.',
  }),
  pendingLocalization({
    instrumentKey: 'gse_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'Zhang & Schwarzer Chinese adaptation (1995) + mainland China validation literature; exact runtime form pending rights-safe freeze.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['gse-cn-zhang-1995', 'gse-cn-zeng-2020'],
    notes: 'Official GSE permission restricts open Internet publication; catalog entry does not expose protected item text.',
  }),
  pendingLocalization({
    instrumentKey: 'mpfi24_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'Fang et al. (2024) C-MPFI-24 validation; exact item/scoring attachment provenance must be frozen before package creation.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['mpfi24-cn-fang-2024'],
    notes: 'Catalog-only until exact-form content and digital/redistribution rights are verified.',
  }),
  pendingLocalization({
    instrumentKey: 'pss10_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'Lu et al. (2017) Simplified Chinese PSS-10 validation; final runtime text requires permission/provenance review.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: ['pss10-cn-lu-2017'],
    notes: 'MAPI/ePROVIDE and translation-rights evidence must be recorded before executable package creation.',
  }),
]

export const getWave1P1LocalizationManifest = (instrumentKey: string, instrumentVersion: string): LocalizationManifestV1 | undefined => (
  WAVE1_P1_LOCALIZATION_MANIFESTS.find((manifest) => (
    manifest.instrumentKey === instrumentKey && manifest.instrumentVersion === instrumentVersion
  ))
)
