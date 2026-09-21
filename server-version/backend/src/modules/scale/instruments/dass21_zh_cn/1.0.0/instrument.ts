import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { dass21IntendedUse } from '../../catalog-defaults'

const catalog: ScaleCatalogManifestV1 = {
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
const localization: LocalizationManifestV1 = {
  ...{
    instrumentKey: catalog.identity.instrumentKey,
    instrumentVersion: catalog.identity.instrumentVersion,
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: 'Gong et al. (2010) Simplified Chinese DASS-21 + Wen et al. (2012) Mainland-Chinese wording adaptation, cross-checked against the official English DASS-21 and public Chinese DASS resources.',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'PENDING',
    cognitiveDebriefStatus: 'PENDING',
    localEvidenceRefs: ['dass21-cn-gong-2010', 'dass21-cn-wen-2012', 'dass21-cn-wang-2016'],
    notes: '本项目将建立单独的 Mainland zh-CN wording revision；该文本属于新的本地化适配，不冒充既有官方 Chinese DASS-21 exact form。UNSW 允许新的翻译，但译本须保持 public domain。完成专家语义审校、14+ 认知访谈/bridging review 与 respondent-safe API projection 前保持 catalog-only。',
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
