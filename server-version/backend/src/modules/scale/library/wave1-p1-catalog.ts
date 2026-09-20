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

const dass21IntendedUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    {
      use: 'INDIVIDUAL_REFLECTION' as const,
      evidenceStatus: 'SUPPORTED' as const,
      notes: '仅提供不依赖个体分数的描述性/教育性反馈；学生或普通被试不得看到数值分数、严重程度等级或心理健康状态判断。',
    },
    {
      use: 'PROGRESS_MONITORING' as const,
      evidenceStatus: 'EVIDENCE_UNKNOWN' as const,
      notes: '内部 authoritative score 可供具备相应权限的研究/专业人员使用；学生侧不展示数值变化或自动个体解释。',
    },
  ],
  forbiddenUses,
}

const dass21: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 2,
  catalogStatus: 'REVIEWED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'dass21_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Depression Anxiety Stress Scales — 21-item, Mainland Chinese Adaptation (14+)',
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
    minAge: 14,
    maxAge: 100,
    populationNotes: '当前产品身份仅对应标准 DASS-21，准入边界锁定为 14 岁及以上（具备一般年龄相符的语言理解能力）。14 岁以下不使用本 package，后续以独立 DASS-Y instrument identity 引入。大陆简体中文证据以大学生和成人样本最完整；14–17 岁部署仍按 PILOT 边界解释，不声称已建立中国青少年常模。',
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
    layoutConstraints: [
      '数字施测必须限制在明确的受测群体内，不以面向公众的开放式网站/App形式提供。',
      '学生/普通被试侧不得返回计算分数、严重程度等级、心理健康状态判断或基于分数的自动个体解释；内部计分仅供授权研究/专业视图使用。',
      '14 岁以下必须使用独立 DASS-Y 产品身份，不得以放宽年龄筛选方式进入本 DASS-21 package。',
    ],
  },
  intendedUse: dass21IntendedUse,
  evidence: [
    {
      evidenceId: 'dass21-cn-gong-2010',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '中国大陆大学生（北京三所高校）',
      ageRange: 'mean 18.88 years (SD 2.54)',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1779,
      studyDesign: 'Item analysis + reliability/validity analyses + confirmatory factor analysis',
      rating: 'SUFFICIENT',
      citation: '龚栩, 谢熹瑶, 徐蕊, 罗跃嘉. (2010). 抑郁-焦虑-压力量表简体中文版(DASS-21)在中国大学生中的测试报告. 中国临床心理学杂志, 18(4), 443-446.',
      doi: '10.16128/j.cnki.1005-3611.2010.04.020',
      notes: 'N=1,779；为大陆简体中文 DASS-21 的早期直接心理测量学证据。',
    },
    {
      evidenceId: 'dass21-cn-wen-2012',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '中国大陆一般成人（六省样本）',
      ageRange: '18–85 years',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 730,
      studyDesign: 'Mainland-Chinese wording adaptation + reliability and validity evaluation',
      rating: 'SUFFICIENT',
      citation: '温义, 吴大兴, 吕雪靖, 李恒桂, 刘晓婵, 杨玉萍, 徐云轩, 赵颖. (2012). 抑郁焦虑压力量表中文版在中国大陆成人中的信效度研究. 中国公共卫生, 28(11), 1436-1438.',
      notes: '研究明确基于既有中文版本与英文原版，针对大陆语言习惯调整字体、个别词语及语句表达；为本项目进行自然化大陆中文本地化提供直接方法学先例，但不等于本项目改写后的 exact-form 已完成验证。',
    },
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
    translationSource: 'Gong et al. (2010) Simplified Chinese DASS-21 + Wen et al. (2012) Mainland-Chinese wording adaptation, cross-checked against the official English DASS-21 and public Chinese DASS resources.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'PENDING',
    localEvidenceRefs: ['dass21-cn-gong-2010', 'dass21-cn-wen-2012', 'dass21-cn-wang-2016'],
    notes: '本项目将建立单独的 Mainland zh-CN wording revision；该文本属于新的本地化适配，不冒充既有官方 Chinese DASS-21 exact form。UNSW 允许新的翻译，但译本须保持 public domain。完成专家语义审校、14+ 认知访谈/bridging review 与 respondent-safe API projection 前保持 catalog-only。',
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