import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Social Media Disorder Scale — catalog-only registration. The SMD scale items
// appear in van den Eijnden, Lemmens & Valkenburg (2016), Computers in Human
// Behavior (subscription); the authors self-archived the article at the
// Utrecht University repository (green OA), which is unreachable from this
// environment. Register only; upgrade after the deposit (or the authors' scale
// distribution terms) is reachable and archived.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'smd9_vdeijnden_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Social Media Disorder Scale (9-item short form)',
    abbreviation: 'SMD9',
    instrumentFamily: 'Social Media Disorder Scale',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '按 DSM-5 IGD 九条标准改编的社交媒体失调：沉溺、耐受、戒断、坚持、取代、欺瞒、逃避、冲突与问题（每标准一是/否题）。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'social_media',
      'behavioral_addiction',
      'license:author_selfarchive_terms_unarchived',
      'population:k12',
      'population:adolescent',
      'response:student_self',
      'use:screening',
      'use:research',
      'language_validation:english_original',
    ],
  },
  population: {
    minAge: 12,
    maxAge: 19,
    populationNotes: '原验证为荷兰青少年样本（10–17 岁）；青少年专用工具，与 K-12 场景高度匹配。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 9,
    estimatedMinutes: 3,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '过去一年（IGD 标准口径，誊录时核对）',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '短版为每标准一是/否题（答"是"计 1），另有 27 题长版为独立精确版本，不得混用。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'SCREENING', evidenceStatus: 'SUPPORTED', notes: '按诊断标准条目计数的青少年筛查设计。' },
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'smd9-vdeijnden-2016',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '荷兰青少年（10–17 岁）',
      locale: 'en',
      territory: 'NL',
      sampleSize: 2392,
      studyDesign: 'Scale development based on DSM-5 IGD criteria; 9-item short form and 27-item long form; 被引约 1,730（检索口径 2026-10）',
      rating: 'SUFFICIENT',
      citation: 'van den Eijnden RJJM, Lemmens JS, Valkenburg PM. (2016). The Social Media Disorder Scale. Computers in Human Behavior, 61, 478–487.',
      doi: '10.1016/j.chb.2016.03.038',
      url: 'https://dspace.library.uu.nl/handle/1874/339949',
      notes: '作者自存档全文在 Utrecht 机构库（绿色 OA）；本环境网络不可达（SSL 失败），升级时优先取用。sampleSize 以原文核对为准。',
    },
  ],
  referenceApplicability: [],
}

const { instrumentKey, instrumentVersion, ...catalogIdentity } = catalog.identity

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey, instrumentVersion },
  catalog: { ...catalog, identity: catalogIdentity },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: {
      title: 'Social Media Disorder Scale (SMD9 short form)',
      citation: 'van den Eijnden RJJM, Lemmens JS, Valkenburg PM. (2016). The Social Media Disorder Scale. Computers in Human Behavior, 61, 478–487; author self-archived at Utrecht University repository.',
      url: 'https://dspace.library.uu.nl/handle/1874/339949',
      publicationYear: 2016,
    },
    reportPlan: {
      dimensionLabels: ['社交媒体失调（满足标准数）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '是/否作答格式与库内 Scale 单选 Likert 架构的适配须在誊录时评估（responseSet 两个选项，score 0/1）。',
        '与 IGDS9-SF 同源自 IGD 九标准，但对象不同（社交媒体 vs 游戏），不合并计分。',
      ],
      disclaimer: '计划报告仅描述社交媒体失调标准的自评计数，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'AUTHOR_SELFARCHIVE_UNREACHABLE: Utrecht 机构库作者自存档 PDF 在本环境不可达（SSL 失败）；Scribd/第三方转传不作依据。',
      'LICENSE_TERMS_UNARCHIVED: 绿色 OA 自存档的再分发边界与作者分发条款须归档确认。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
