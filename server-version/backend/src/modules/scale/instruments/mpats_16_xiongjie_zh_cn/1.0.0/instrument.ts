import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// MPATS 手机成瘾倾向量表 — catalog-only registration. Chinese original scale
// (熊婕、周宗奎、陈武、游志麒、翟紫艳, 2012, 中国心理卫生杂志 26(3):69–72).
// Item text is behind the journal paywall (CNKI); journal/author authorization
// must be archived before any verbatim transcription.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'mpats_16_xiongjie_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: '大学生手机成瘾倾向量表（Mobile Phone Addiction Tendency Scale）',
    abbreviation: 'MPATS',
    instrumentFamily: '手机成瘾倾向量表',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '手机使用成瘾倾向的中文本土自评：戒断症状、突显行为、社交抚慰与心境改变四维（原工具命名口径）。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'problematic_smartphone_use',
      'behavioral_addiction',
      'license:chinese_journal_permission_pending',
      'population:k12',
      'population:adolescent_validation_available',
      'response:student_self',
      'use:research',
      'use:screening',
      'language_validation:chinese_original',
    ],
  },
  population: {
    minAge: 14,
    maxAge: 25,
    populationNotes: '原编制样本为大学生，国内中学生研究中亦有应用；中学生年龄带在取得题文与授权后按应用文献核对登记。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 16,
    estimatedMinutes: 6,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '手机使用的一般化自评',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '官方 5 点计分（1=非常不符 … 5=非常符合），四维各 4 题；维度归属与总分算法以原文为准，未核对前不得凭二手材料立键。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'SCREENING', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '国内文献常用总分切分，但切分依据须取得原文后按证据归档。' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'mpats-xiongjie-2012',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '中国大学生',
      locale: 'zh-CN',
      territory: 'CN',
      studyDesign: 'Scale development: exploratory factor analysis yielding 16 items in four dimensions;国内手机成瘾研究中使用最广的本土量表之一',
      rating: 'SUFFICIENT',
      citation: '熊婕, 周宗奎, 陈武, 游志麒, 翟紫艳. (2012). 大学生手机成瘾倾向量表的编制. 中国心理卫生杂志, 26(3), 69–72.',
      notes: '中文原创工具；题文与计分键在期刊付费墙内（CNKI），中文施测为天然路径（原版即中文），授权到位后可直接誊录。',
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
      title: '大学生手机成瘾倾向量表（MPATS, 16-item）',
      citation: '熊婕, 周宗奎, 陈武, 游志麒, 翟紫艳. (2012). 大学生手机成瘾倾向量表的编制. 中国心理卫生杂志, 26(3), 69–72.',
      publicationYear: 2012,
    },
    reportPlan: {
      dimensionLabels: ['戒断症状', '突显行为', '社交抚慰', '心境改变'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '中文原创工具，中文施测路径最短；但仍须完成授权归档与原文计分键核对。',
        '与 SAS-SV 为相邻构念（均为问题性手机使用），家族边界登记于 dedup.json。',
      ],
      disclaimer: '计划报告仅描述手机使用倾向的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_BEHIND_PAYWALL: 16 题原文在《中国心理卫生杂志》付费墙（CNKI）内，须先取得期刊/作者授权。',
      'SCORING_KEY_UNVERIFIED: 四维逐题归属与总分算法须以原文核对后冻结。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
