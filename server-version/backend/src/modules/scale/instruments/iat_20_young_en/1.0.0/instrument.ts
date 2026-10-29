import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Internet Addiction Test — catalog-only registration. The 20-item IAT text
// originates in Young's copyrighted book "Caught in the Net" (Wiley, 1998) and
// the author's own distribution site; the free-for-research convention is
// widely relied on, but no reachable authoritative item text or formal terms
// could be archived from this environment (netaddiction.com unreachable).
// Register only; transcribe after terms + text are archived.

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'CANDIDATE',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'iat_20_young_en',
    instrumentVersion: '1.0.0',
    canonicalName: 'Internet Addiction Test (20-item)',
    abbreviation: 'IAT',
    instrumentFamily: 'Internet Addiction Test',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SELF_REGULATION'],
    constructDefinition: '问题性网络使用的整体自评：突显性、过度使用、忽视工作、预期、失控与社会退缩等心理依赖与日常功能损害成分。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [
      'domain:screen_use',
      'problematic_internet_use',
      'behavioral_addiction',
      'license:free_research_convention_publisher_terms_unarchived',
      'population:k12',
      'response:student_self',
      'use:screening',
      'use:research',
      'language_validation:chinese_validation_published',
    ],
  },
  population: {
    minAge: 12,
    maxAge: 25,
    populationNotes: 'IAT 应用于中学生至成人；中文版（多版本）在中国样本有大量验证。具体年龄带在誊录并确定官方计分版本时登记。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 20,
    estimatedMinutes: 10,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'],
    timeFrame: '网络使用的一般化自评',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [
      '计分版本存在 5 点与 6 点（0–5）两种流传口径，总分区间随之不同；誊录时须先冻结官方版本（以 Young 分发件为准）。',
      '因素结构文献报告不一（Widyanto & McMurran 六因子 vs Chang & Law 二因子），计分以总分为主、不自行引入因子分。',
    ],
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'SCREENING', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '流传的分数段解释（20–49/50–79/80–100）属作者建议口径，誊录后按证据归档处理，不作为本地界值。' },
    ],
    forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'],
  },
  evidence: [
    {
      evidenceId: 'iat-young-1998',
      evidenceType: 'CONTENT_VALIDITY',
      population: '多国样本（元分析口径）',
      locale: 'en',
      territory: 'US',
      studyDesign: 'Most widely used screening instrument for problematic internet use; adapted from pathological gambling criteria (DSM-IV)',
      rating: 'SUFFICIENT',
      citation: 'Young KS. (1998). Internet addiction: The emergence of a new clinical disorder. CyberPsychology & Behavior, 1(3), 237–244; 20-item IAT distributed via the author (Caught in the Net, Wiley).',
      notes: '被引数千次级；结构效度文献：Widyanto & McMurran (2004), CyberPsychology & Behavior 7(4):443–450（六因子）；Chang & Law (2008), CHB 24(6):2597–2619（二因子）。',
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
      title: 'Internet Addiction Test (IAT, 20-item)',
      citation: 'Young KS. (1998). Internet addiction: The emergence of a new clinical disorder. CyberPsychology & Behavior, 1(3), 237–244; 20-item form from the author\u2019s distribution (Caught in the Net, Wiley, 1998).',
      url: 'https://netaddiction.com/',
      publicationYear: 1998,
    },
    reportPlan: {
      dimensionLabels: ['问题性网络使用（总分）'],
      limitations: [
        '登记阶段：未誊录题文，不能施测；不得把本登记当作工具入库完成。',
        '与 SAS-SV/IGDS9-SF 的关系：IAT 面向『网络使用』整体（电脑端传统主导），不与手机专用或游戏专用工具合并计分。',
        '将不发明常模或本地界值；流传分数段解释须在归档官方材料后另行处理。',
      ],
      disclaimer: '计划报告仅描述问题性网络使用的自评结果，不用于诊断或高风险决策。',
    },
    blockers: [
      'EXECUTABLE_NOT_REGISTERED',
      'ITEM_TEXT_SOURCE_UNARCHIVED: 20 题逐字文本源（作者专著/作者分发件）在本环境不可达（netaddiction.com 连接失败），未获得可核对的权威文本。',
      'PUBLISHER_TERMS_UNARCHIVED: 非商业研究免费的通行惯例与 Wiley 版权的关系须归档书面依据后再誊录。',
    ],
  },
} satisfies ScaleInstrumentSourceV1
