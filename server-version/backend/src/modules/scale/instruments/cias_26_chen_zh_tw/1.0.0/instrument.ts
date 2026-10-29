import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// CIAS 陈氏网络成瘾量表 — catalog-only registration. Chinese original scale
// (陳淑惠 et al., 2003, 中華心理學刊 45(3):279–294, traditional Chinese).
// Item text is behind the journal; authorization must be archived before
// transcription. Widely used across Chinese-language samples.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'cias_26_chen_zh_tw',
    instrumentVersion: '1.0.0',
    canonicalName: '陳氏網路成癮量表（Chen Internet Addiction Scale）',
    abbreviation: 'CIAS',
    instrumentFamily: '網路成癮量表',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '问题性网络使用的中文本土自评：文献报告的维度含强迫性上网与戒断、耐受与时间管理、人际与健康冲突等成分；总分反映网络使用失调程度。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'problematic_internet_use',
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
    minAge: 12,
    maxAge: 25,
    populationNotes: '原编制与大量后续验证覆盖台湾青少年至大学生；简体使用须先完成简繁转换的语言学处理并立新版本，不得直接标称简体验证版。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'ESTABLISHED',
  },
  administration: {
    itemCount: 26,
    estimatedMinutes: 10,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '网络使用的一般化自评',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '计分点数与逐题维度归属（文献报告存在五因子结构与修订版 CIAS-R）须以原文核对后冻结，不凭二手材料立键。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'SCREENING', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '切分依据须取得原文后按证据归档。' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'cias-chen-2003',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '台湾大学生与青少年',
      locale: 'zh-TW',
      territory: 'TW',
      studyDesign: 'Scale development and psychometric properties; 中文学术圈网络成瘾研究中使用最久的本土量表之一',
      rating: 'SUFFICIENT',
      citation: '陳淑惠, 翁儷禎, 蘇逸人, 吳和懋, 楊品鳳. (2003). 中文網路成癮量表之編製與心理計量特性研究. 中華心理學刊, 45(3), 279–294.',
      notes: '中文原创工具（繁体）；简体版本须另行处理与验证。',
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
      title: '陳氏網路成癮量表（CIAS, 26-item）',
      citation: '陳淑惠, 翁儷禎, 蘇逸人, 吳和懋, 楊品鳳. (2003). 中文網路成癮量表之編製與心理計量特性研究. 中華心理學刊, 45(3), 279–294.',
      publicationYear: 2003,
    },
    reportPlan: {
      dimensionLabels: ['問題性網路使用（總分）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '繁体原版；简体施测前须完成简繁语言学处理、独立验证并立新版本。',
        '与 IAT 同为整体性网络使用工具，家族边界登记于 dedup.json。',
      ],
      disclaimer: '计划报告仅描述问题性网络使用的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_BEHIND_PAYWALL: 26 题原文在期刊付费墙内，须先取得授权。',
      'TRADITIONAL_CHINESE_VARIANT: 简体应用须另行语言处理与验证，不得直接沿用繁体验证结论。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
