import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Bergen Social Media Addiction Scale — catalog-only registration. The six
// BSMAS items appear in Andreassen et al. (2016), Psychology of Addictive
// Behaviors (APA, subscription); the Bergen group historically distributes its
// scales to researchers on request. Distribution terms must be archived before
// transcription.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'bsmas_6_andreassen_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Bergen Social Media Addiction Scale',
    abbreviation: 'BSMAS',
    instrumentFamily: 'Bergen Addiction Scales',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '按成瘾成分模型（突显、耐受、心境改变、复发、戒断、冲突）自评社交媒体使用的失调成分。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'social_media',
      'behavioral_addiction',
      'license:author_request_distribution_terms_unarchived',
      'population:k12',
      'population:adolescent_validation_available',
      'response:student_self',
      'use:research',
      'use:screening',
      'language_validation:chinese_validation_published',
    ],
  },
  population: {
    minAge: 12,
    maxAge: 25,
    populationNotes: 'BSMAS 在青少年与大学生样本有大量验证（含中文版验证文献）；年龄带在誊录后按目标人群证据登记。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 6,
    estimatedMinutes: 2,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '过去一年内的社交媒体使用（原手册口径，誊录时核对）',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '官方 5 点计分（Very rarely … Very often），总分 6–30；六题对应成瘾六成分，不设维度分。',
      '社交媒体范围以原工具定义为准（Facebook 系谱工具），中文场景的平台对应需在译制时说明。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'SCREENING', evidenceStatus: 'EVIDENCE_UNKNOWN' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'bsmas-andreassen-2016',
      evidenceType: 'INTERNAL_CONSISTENCY',
      population: '挪威青少年与成人（多次验证汇总）',
      locale: 'en',
      territory: 'NO',
      studyDesign: 'Six-item scale derived from the components model; extensive cross-national validations (文献报告被引千次级)',
      rating: 'SUFFICIENT',
      citation: 'Andreassen CS, Billieux J, Griffiths MD, et al. (2016). The relationship between addictive use of social media and video games and symptoms of psychiatric disorders: A large-scale cross-sectional study. Psychology of Addictive Behaviors, 30(2), 252–262.',
      doi: '10.1037/adb0000160',
      notes: 'BSMAS 题文在 APA 订阅文章内；Bergen 研究组以研究者申请方式分发量表，条款未归档。',
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
      title: 'Bergen Social Media Addiction Scale (BSMAS, 6-item)',
      citation: 'Andreassen CS et al. (2016). Psychology of Addictive Behaviors, 30(2), 252–262; scale distributed by the Bergen research group on request.',
      url: 'https://doi.org/10.1037/adb0000160',
      publicationYear: 2016,
    },
    reportPlan: {
      dimensionLabels: ['社交媒体使用失调（总分）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '社交媒体构念与手机/游戏使用工具相邻但不同对象（平台 vs 设备/活动），不合并计分。',
        '题干中的平台名称为英文场景，中文译制须做平台对应说明并立新版本。',
      ],
      disclaimer: '计划报告仅描述社交媒体使用失调的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_BEHIND_PAYWALL: 六题原文在 APA 订阅文章内。',
      'DISTRIBUTION_TERMS_UNARCHIVED: Bergen 研究组的申请式分发条款须书面归档后再誊录。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
