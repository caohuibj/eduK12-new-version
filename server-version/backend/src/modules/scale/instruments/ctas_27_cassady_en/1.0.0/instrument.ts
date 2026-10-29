import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Cognitive Test Anxiety Scale — catalog-only registration. The verbatim 27-item
// set lives in the appendix of Cassady & Johnson (2002), a subscription Elsevier
// article; third-party copies (Scribd, psytests.org) are user uploads and are not
// a redistribution basis under this library's rules. Register only; upgrade when
// the author's distribution terms are archived.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'ctas_27_cassady_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Cognitive Test Anxiety Scale (27-item)',
    abbreviation: 'CTAS',
    instrumentFamily: 'Cognitive Test Anxiety Scale',
  },
  construct: {
    primaryDomain: 'SOCIAL_EMOTIONAL',
    secondaryDomains: [],
    constructDefinition: '考试情境中的认知性焦虑：担忧、无关思维干扰与任务无关认知活动（对失败的预期性担忧、考试中的走神与记忆提取受阻），预测学业成绩的考试焦虑认知维度。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:exam_anxiety',
      'test_anxiety',
      'cognitive_interference',
      'worry',
      'license:author_distribution_terms_unverified',
      'population:k12',
      'response:student_self',
      'use:research',
      'use:screening',
      'language_validation:english_original',
    ],
  },
  population: {
    minAge: 12,
    maxAge: 25,
    populationNotes: '原始验证为大学生样本；CTAS 在中学生群体有广泛应用但年龄带须在誊录与版本核对时以实际研究为准，暂不声明可施测范围。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 27,
    estimatedMinutes: 10,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '考试情境的一般化自评',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '官方 4 点『典型程度』计分；CTAS-2（Cassady & Finch, 2015, 24 题）为独立版本，不与 27 题版混用。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '待题文与计分核验后再评估。' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'ctas-cassady-johnson-2002',
      evidenceType: 'CRITERION',
      population: '美国大学生',
      locale: 'en',
      territory: 'US',
      sampleSize: 284,
      studyDesign: 'Scale development validating cognitive test anxiety against course test scores, GPA and SAT; correlations to exam performance around r=.25',
      rating: 'SUFFICIENT',
      citation: 'Cassady JC, Johnson RE. (2002). Cognitive test anxiety and academic performance. Contemporary Educational Psychology, 27(2), 270\u2013295.',
      doi: '10.1006/ceps.2001.1094',
      url: 'https://doi.org/10.1006/ceps.2001.1094',
      notes: '被引数百至 1,000+（检索口径 2026-10）；题文在论文附录内，订阅墙内。sampleSize 以原文样本表核对为准。',
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
      title: 'Cognitive Test Anxiety Scale (CTAS, 27-item)',
      citation: 'Cassady JC, Johnson RE. (2002). Cognitive test anxiety and academic performance. Contemporary Educational Psychology, 27(2), 270\u2013295 (items in article appendix).',
      url: 'https://doi.org/10.1006/ceps.2001.1094',
      publicationYear: 2002,
    },
    reportPlan: {
      dimensionLabels: ['认知性考试焦虑'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '认知维度与 Westside 的担忧项、TAI 的忧虑维相邻，但构念界定与计分不同，不合并使用。',
        '将不发明常模、百分位或临床界值；中文施测前须完成翻译验证并立新版本。',
      ],
      disclaimer: '计划报告仅描述考试情境认知干扰的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_BEHIND_PAYWALL: 27 题逐字文本在 Elsevier 订阅论文附录；Scribd/psytests 等第三方转传不作为再分发依据。',
      'AUTHOR_TERMS_UNVERIFIED: 作者（Cassady）的官方分发条款未归档确认。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
