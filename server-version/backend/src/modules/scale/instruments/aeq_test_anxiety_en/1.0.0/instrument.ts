import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// AEQ test anxiety — catalog-only registration. The author-distributed manuals
// (2005 AEQ manual; 2022 AEQ-R user's manual, author-deposited at the University
// of Essex repository) carry the official item text, but none was reachable from
// this environment at registration time, so no verbatim items were transcribed
// and no executable was created. Upgrade path follows the TSEC-22 precedent.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'aeq_test_anxiety_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Achievement Emotions Questionnaire — Test Anxiety Scale',
    abbreviation: 'AEQ Test Anxiety',
    instrumentFamily: 'Achievement Emotions Questionnaire',
  },
  construct: {
    primaryDomain: 'SOCIAL_EMOTIONAL',
    secondaryDomains: ['MOTIVATION'],
    constructDefinition: '考试情境中的焦虑情绪体验（考试前、中、后的紧张、担忧与生理唤醒），是控制-价值理论下学业情绪框架中的情境特异负性情绪；与库内 value_cost、academic_self_efficacy 同属期望-价值/控制-价值前因-结果链，但测量对象为情绪本身。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:exam_anxiety',
      'test_anxiety',
      'achievement_emotions',
      'control_value_theory',
      'license:research_use_convention_unconfirmed',
      'population:k12',
      'response:student_self',
      'use:research',
      'use:reflection',
      'language_validation:english_original_pending_manual',
    ],
  },
  population: {
    minAge: 9,
    maxAge: 25,
    populationNotes: '原始 AEQ 面向大学生；AEQ-ES 覆盖小学数学情境（Lichtenfeld et al., 2012），AEQ-PA 覆盖青春前期。具体年龄带在誊录题文并确定版本（AEQ 原版 / AEQ-R / AEQ-ES）时登记，暂不声明可施测范围。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 17,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '考试情境（before/during/after；版本确定后按官方分块执行）',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '题数 17 为文献通引的 AEQ 考试焦虑分量表规模，誊录时须以官方手册逐题核对后再冻结。',
      '官方 5 点情绪强度计分；不得与 AEQ-R 分块结构或 AEQ-ES 学科版混用。',
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
      evidenceId: 'aeq-pekrun-2011',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '大学生（德/美/加多样本）',
      locale: 'en',
      territory: 'US',
      sampleSize: 2000,
      studyDesign: 'Multi-sample validation of the 24-scale AEQ including the test anxiety scale; class/learning/test emotion structures',
      rating: 'SUFFICIENT',
      citation: 'Pekrun R, Goetz T, Frenzel AC, Perry RP, Perry KM. (2011). Measuring emotions in students\u2019 learning and performance: The Achievement Emotions Questionnaire (AEQ). Contemporary Educational Psychology, 36(1), 36\u201348.',
      doi: '10.1016/j.cedpsych.2010.10.002',
      url: 'https://doi.org/10.1016/j.cedpsych.2010.10.002',
      notes: 'AEQ 2011 原文被引约 3,700+（Google Scholar 检索口径 2026-10）。sampleSize 为多样本合计的文献口径，誊录时以原文表格核对。',
    },
    {
      evidenceId: 'aeq-r-manual-2022',
      evidenceType: 'CONTENT_VALIDITY',
      population: '官方修订版手册',
      locale: 'en',
      territory: 'GB',
      studyDesign: 'AEQ-R user\u2019s manual (2022), author-deposited full text at the University of Essex research repository',
      rating: 'SUFFICIENT',
      citation: 'Pekrun R. (2022). Achievement Emotions Questionnaire \u2014 Revised (AEQ-R): User\u2019s Manual. University of Essex repository.',
      url: 'https://repository.essex.ac.uk/34474/',
      notes: '官方 2022 修订版手册，作者自存档全文公开；本环境网络不可达（直连超时），升级原生时优先采用。研究用途免费惯例以手册正式条款为准，登记为未确认。',
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
      title: 'Achievement Emotions Questionnaire (AEQ) — Test Anxiety Scale',
      citation: 'Pekrun R, Goetz T, Frenzel AC, Perry RP, Perry KM. (2011). Contemporary Educational Psychology, 36(1), 36\u201348; official manuals: 2005 AEQ manual; 2022 AEQ-R user\u2019s manual (Pekrun).',
      url: 'https://repository.essex.ac.uk/34474/',
      publicationYear: 2011,
    },
    reportPlan: {
      dimensionLabels: ['考试焦虑（AEQ 分量表）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '考试焦虑为情境特异情绪，不等同于 DASS-21/GAD-7 的一般性焦虑，也不并入其计分。',
        '将不发明常模、百分位或临床界值；中文施测前须完成翻译验证并立新版本。',
      ],
      disclaimer: '计划报告仅描述考试情境情绪的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'OFFICIAL_MANUAL_UNREACHABLE: 2022 AEQ-R 手册（Essex 仓库，作者自存档）与 2005 AEQ 手册（ResearchGate 附件）在本环境均不可达；Scribd 转传不作依据。',
      'LICENSE_TERMS_UNCONFIRMED: 研究用途免费的作者惯例须以官方手册条款归档确认。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
