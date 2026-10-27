// Copy to src/modules/scale/instruments/ccnes_t/1.0.0/instrument.ts on integration.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'ccnes_t', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: "Coping with Children's Negative Emotions Scale: Teacher Version", abbreviation: 'CCNES-T', instrumentFamily: "Coping with Children's Negative Emotions Scale" },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: [], constructDefinition: '教师自评在学生表达消极情绪的假设情境中可能采取的六类回应，包括自身苦恼、惩罚、鼓励表达、情绪导向、问题导向及轻视回应。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:sel_context", "population:teachers", "response:teacher_self", "use:reflection", "use:research", "license:noncommercial", "construct:sel_ccnes_t_dimension_1", "construct:sel_ccnes_t_dimension_2", "construct:sel_ccnes_t_dimension_3", "construct:sel_ccnes_t_dimension_4", "construct:sel_ccnes_t_dimension_5", "construct:sel_ccnes_t_dimension_6", 'teacher_self_report', 'emotion_socialization', 'teacher_response', 'distress_reactions', 'punitive_reactions', 'expressive_encouragement', 'emotion_focused', 'problem_focused', 'minimization'] },
    population: { populationNotes: '教师对学前至小学低年级儿童情绪情境的自评；中文工作表达尚未验证。', respondentTypes: ['SELF'], developmentalEvidence: 'UNKNOWN' },
    administration: { itemCount: 72, estimatedMinutes: 15, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '12 个假设情境，每个回应分别估计可能性；无指定回忆时段', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['12 个情境各含 6 个独立 1–7 分可能性评定，共 72 次回答；不是情境单选，也无正确答案。', '每道回应展示所属情境及完整题干；仅 DR 的 2A、7C、8C、10A 反向。', '15 分钟是产品估计，不是作者承诺。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }, { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '结合具体情境与条件进行教育性反思，不作为教师考核。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'fabes-ccnes-t-2000', evidenceType: 'CONTENT_VALIDITY', population: 'Teachers reporting responses to preschool and early elementary student distress scenarios', locale: 'en', territory: 'US', studyDesign: 'Authors’ teacher-version instrument and scoring instructions; six response types across twelve scenarios.', rating: 'UNKNOWN', citation: "Fabes RA, Eisenberg N, Bernzweig J. The Coping with Children's Negative Emotions Scale: Teacher Version. 2000. Arizona State University.", url: 'https://ccnes.org/ccnes-teacher-responses', notes: '此为原版资料而非完整心理测量验证研究；不能将 1990 家长版证据直接等同本版。' }],
    referenceApplicability: [],
  },
  usageRequirements: { schemaVersion: 1, policyVersion: 'ccnes-t-educational-research', requiredRightsActions: ['electronicAdministration', 'scoring', 'display'], notes: ['作者下载页规定仅用于教育和／或研究，并遵循伦理指导。', '不将教育/研究用途等同于不限范围商业、翻译及再分发授权。'] },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: "Coping with Children's Negative Emotions Scale: Teacher Version", citation: 'Fabes, Eisenberg, & Bernzweig (2000). Arizona State University.', url: 'https://ccnes.org/ccnes-teacher-responses', publicationYear: 2000 },
    reportPlan: { dimensionLabels: ['苦恼反应', '惩罚反应', '鼓励表达', '关注情绪的回应', '关注问题的回应', '轻视反应'], limitations: ['对假设情境的自我报告，不是对实际课堂行为的直接观察。', '情境和资源会影响回应；中文工作表达尚未验证。', '不提供教师排名、常模或临床界线。'], disclaimer: '教育性反思，不用于教师绩效评价、诊断或高风险决策。' },
    blockers: ['缺少完整可交付情境、72 条回应及逐条中文工作译稿；不能施测。', '静态报告尚未接入动态评分和缺答分支。'],
  },
} satisfies ScaleInstrumentSourceV1
