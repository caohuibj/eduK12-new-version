import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Nomophobia Questionnaire — catalog-only registration. The 20 NMP-Q items were
// published in Yildirim & Correia (2015), Computers in Human Behavior
// (Elsevier, subscription). No authoritative open item text reachable;
// register only.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'nmpq_20_yildirim_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Nomophobia Questionnaire',
    abbreviation: 'NMP-Q',
    instrumentFamily: 'Nomophobia',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['WELL_BEING'],
    constructDefinition: '无手机恐惧（no-mobile-phone phobia）：无法使用手机或手机不在可及范围时的焦虑感受，含无法沟通、放弃便利、无法获取信息与失去连接四成分。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'nomophobia',
      'smartphone_separation_anxiety',
      'license:publisher_terms_unarchived',
      'population:k12',
      'response:student_self',
      'use:research',
      'use:screening',
      'language_validation:english_original',
    ],
  },
  population: {
    minAge: 14,
    maxAge: 25,
    populationNotes: '原编制为大学生样本；青少年应用文献较多但年龄带在誊录后按证据登记。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 20,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '一般化自评（手机不可及情境）',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '官方 7 点 Likert 计分（1=Strongly disagree … 7=Strongly agree），总分 20–140；四成分不单独计分（原文口径，誊录时核对）。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'nmpq-yildirim-2015',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '美国大学生',
      locale: 'en',
      territory: 'US',
      studyDesign: 'Scale development with mixed-methods qualitative and EFA; four-factor structure, 被引千次级',
      rating: 'SUFFICIENT',
      citation: 'Yildirim C, Correia AP. (2015). Exploring the dimensions of nomophobia: Development and validation of a self-reported questionnaire. Computers in Human Behavior, 49, 130–139.',
      doi: '10.1016/j.chb.2015.02.059',
      notes: '题文在 Elsevier 订阅文章内；20 题逐字文本须先归档授权。',
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
      title: 'Nomophobia Questionnaire (NMP-Q, 20-item)',
      citation: 'Yildirim C, Correia AP. (2015). Computers in Human Behavior, 49, 130–139.',
      url: 'https://doi.org/10.1016/j.chb.2015.02.059',
      publicationYear: 2015,
    },
    reportPlan: {
      dimensionLabels: ['无手机恐惧（总分）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        'NMP-Q 测手机不可及时的焦虑感受，与问题性使用（SAS-SV/MPATS）为相邻构念，不合并计分。',
        '与 dass21 焦虑维的关系：情境特异 vs 泛化焦虑，见 dedup.json。',
      ],
      disclaimer: '计划报告仅描述手机分离焦虑的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_BEHIND_PAYWALL: 20 题原文在 Elsevier 订阅文章内。',
      'AUTHOR_TERMS_UNARCHIVED: 作者分发条款未归档。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
