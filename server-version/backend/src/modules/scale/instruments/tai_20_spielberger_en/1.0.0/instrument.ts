import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Test Anxiety Inventory — catalog-only registration. The TAI is distributed
// commercially by Mind Garden (per-unit License to Administer; manual sold with
// review-only form access), so no verbatim item text may be transcribed into a
// public repository. The widely circulated Chinese 叶仁敏/Hagtvet version has an
// unverified authorization chain. Register only.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'tai_20_spielberger_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Test Anxiety Inventory (20-item)',
    abbreviation: 'TAI',
    instrumentFamily: 'Test Anxiety Inventory',
  },
  construct: {
    primaryDomain: 'SOCIAL_EMOTIONAL',
    secondaryDomains: [],
    constructDefinition: '考试焦虑的情境特异特质：忧虑（Worry，对失败后果的认知担忧）与情绪性（Emotionality，考试情境的紧张与生理唤醒）两维自评。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:exam_anxiety',
      'test_anxiety',
      'worry',
      'emotionality',
      'license:commercial_distribution_mindgarden',
      'population:k12',
      'response:student_self',
      'use:research',
      'language_validation:chinese_version_unverified_rights',
    ],
  },
  population: {
    minAge: 12,
    maxAge: 25,
    populationNotes: 'TAI 应用于中学至大学群体；中文流传版（叶仁敏 & Hagtvet）的常模与适用年龄须在取得授权后核对，暂不声明可施测范围。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 20,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '考试情境的一般化自评（特质取向）',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '官方 4 点计分，忧虑 8 题 + 情绪性 8 题的两维结构以官方手册为准；另存在 TAI-5 短版（Kösters et al., 2023）为独立版本。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '待授权与题文核验后再评估。' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'tai-spielberger-1980',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '多国样本（手册汇总）',
      locale: 'en',
      territory: 'US',
      studyDesign: 'Preliminary professional manual establishing the worry/emotionality two-factor structure; repeatedly identified as the most commonly used validated test anxiety self-report instrument',
      rating: 'SUFFICIENT',
      citation: 'Spielberger CD, Gonzalez HP, Taylor CJ, Antonaci JV, Williams NG, Lee RE, Carter SR. (1980). Test Anxiety Inventory: Preliminary Professional Manual. Consulting Psychologists Press.',
      notes: '教科书级经典工具，被引数千次级；当前由 Mind Garden 商业分发。systematic review: von der Embse et al. (2018), Journal of Affective Disorders 227, 34\u201348。',
    },
    {
      evidenceId: 'tai-5-kosters-2023',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '荷兰青少年',
      locale: 'en',
      territory: 'NL',
      studyDesign: 'Validation of the five-item short form (TAI-5) in adolescents',
      rating: 'SUFFICIENT',
      citation: 'Kösters MP et al. (2023). Validation of the five-item Test Anxiety Inventory (TAI-5) in Dutch adolescents.',
      notes: '近年短版证据；如后续取得 TAI 题文授权，可一并评估 TAI-5 作为独立精确版本登记。',
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
      title: 'Test Anxiety Inventory (TAI, 20-item)',
      citation: 'Spielberger CD et al. (1980). Test Anxiety Inventory: Preliminary Professional Manual. Consulting Psychologists Press; distributed by Mind Garden.',
      url: 'https://www.mindgarden.com/150-test-anxiety-inventory',
      publicationYear: 1980,
    },
    reportPlan: {
      dimensionLabels: ['忧虑（Worry）', '情绪性（Emotionality）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '忧虑/情绪性两维与 Westside 的担忧/损害构成相邻但不同家族，不合并计分。',
        '将不发明常模、百分位或临床界值；中文流传版（叶仁敏 & Hagtvet）授权链未确认，不得直接采用。',
      ],
      disclaimer: '计划报告仅描述考试焦虑的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'COMMERCIAL_DISTRIBUTION: Mind Garden 按份许可（License to Administer，$2.75/份起、最低 20 份；手册仅 review-only），题文不得复制入公开仓库。',
      'CHINESE_VERSION_RIGHTS_UNVERIFIED: 中文流传版授权链未确认；取得 Mind Garden 或作者授权前不得誊录任何语言题文。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
