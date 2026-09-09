import type { LocalizationManifestV1 } from './localization-manifest'
import type { ScaleCatalogManifestV1 } from './catalog-manifest'

/**
 * Wave 0 code-owned catalog entries.
 *
 * These records intentionally contain discovery and governance metadata only.
 * They are not a second runner, do not contain item text, and do not duplicate
 * authorization facts. The executable package remains the source of truth for
 * scoring and report construction.
 */

const REVIEWED_AT = '2026-09-01T00:00:00Z'

const standardIntendedUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'INDIVIDUAL_REFLECTION' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'PROGRESS_MONITORING' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '需要结合重复测量设计解释，不作群体比较。' },
  ],
  forbiddenUses: [
    'DIAGNOSIS' as const,
    'HIGH_STAKES_SELECTION' as const,
    'SCHOOL_RANKING' as const,
    'TEACHER_ACCOUNTABILITY' as const,
    'UNSUPPORTED_GROUP_COMPARISON' as const,
  ],
}

const adexi: ScaleCatalogManifestV1 = {
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

const who5: ScaleCatalogManifestV1 = {
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
  evidence: [],
  referenceApplicability: [],
}

const sdqParent: ScaleCatalogManifestV1 = {
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

const sdqTeacher: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'sdq_teacher_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Strengths and Difficulties Questionnaire — Teacher T4–10',
    abbreviation: 'SDQ Teacher T4–10',
    instrumentFamily: 'Strengths and Difficulties Questionnaire',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SOCIAL_EMOTIONAL', 'TEACHER_OBSERVATION'],
    constructDefinition: '教师对 4–10 岁儿童情绪、行为、注意、同伴关系、亲社会行为及影响的观察描述。',
    constructLevel: 'BROAD_DOMAIN',
    constructOverlapTags: ['sdq', 'teacher_report', 'impact_supplement'],
  },
  population: {
    minAge: 4,
    maxAge: 10,
    populationNotes: '教师 T4–10 版本；当前包的可执行内容为英文来源，zh-CN 翻译仍受既有 gate 约束。',
    respondentTypes: ['TEACHER'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 29,
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

const texiParent: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'texi_parent_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Teenage Executive Functioning Inventory — Parent',
    abbreviation: 'TEXI Parent',
    instrumentFamily: 'Teenage Executive Functioning Inventory',
  },
  construct: {
    primaryDomain: 'EXECUTIVE_FUNCTION',
    secondaryDomains: ['PARENT_OBSERVATION'],
    constructDefinition: '家长对青少年工作记忆与抑制相关执行功能表现的观察描述。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['texi', 'parent_report', 'working_memory', 'inhibition'],
  },
  population: {
    minAge: 13,
    maxAge: 19,
    populationNotes: '英文家长观察版本；当前部署不提供未经签署的 zh-CN 文本。',
    respondentTypes: ['PARENT'],
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

const texiTeacher: ScaleCatalogManifestV1 = {
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

export const WAVE0_SCALE_CATALOG_MANIFESTS: readonly ScaleCatalogManifestV1[] = [
  adexi,
  who5,
  sdqParent,
  sdqTeacher,
  texiParent,
  texiTeacher,
]

const localization = (input: Omit<LocalizationManifestV1, 'schemaVersion' | 'localizationVersion' | 'reviewStatus' | 'reviewedAt'>): LocalizationManifestV1 => ({
  ...input,
  schemaVersion: 1,
  localizationVersion: '1.0.0',
  reviewStatus: 'APPROVED',
  reviewedAt: REVIEWED_AT,
})

export const WAVE0_LOCALIZATION_MANIFESTS: readonly LocalizationManifestV1[] = [
  localization({
    instrumentKey: 'adexi_v1',
    instrumentVersion: '2.0.0',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    translationSource: '项目已授权的 ADEXI 中文适配 package',
    adaptationMethod: 'CULTURAL_ADAPTATION',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: '本地化 provenance 仅描述当前部署文本来源；不改变 package scoring identity。',
  }),
  localization({
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    sourceLocale: 'zh-CN',
    targetLocale: 'zh-CN',
    translationSource: 'WHO 官方 Chinese PR 字符版本',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
  }),
  localization({
    instrumentKey: 'sdq_parent_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'zh-CN',
    targetLocale: 'zh-CN',
    translationSource: '已授权 SDQ Chinese Simplified parent source',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
  }),
  localization({
    instrumentKey: 'sdq_teacher_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'en',
    translationSource: 'SDQ Teacher T4–10 English source form',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: 'product key 保留 zh_cn 历史命名；当前可执行内容与 catalog 目标 locale 均为 en。',
  }),
  localization({
    instrumentKey: 'texi_parent_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'en',
    translationSource: 'TEXI English parent source form',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: 'zh-CN localization is not represented by this manifest and remains blocked by the existing gate.',
  }),
  localization({
    instrumentKey: 'texi_teacher_zh_cn',
    instrumentVersion: '1.0.0',
    sourceLocale: 'en',
    targetLocale: 'en',
    translationSource: 'TEXI English teacher source form',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: 'zh-CN localization is not represented by this manifest and remains blocked by the existing gate.',
  }),
]

export const getWave0LocalizationManifest = (instrumentKey: string, instrumentVersion: string): LocalizationManifestV1 | undefined => (
  WAVE0_LOCALIZATION_MANIFESTS.find((manifest) => (
    manifest.instrumentKey === instrumentKey && manifest.instrumentVersion === instrumentVersion
  ))
)
