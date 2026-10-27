// Copy to src/modules/scale/instruments/erica16/1.0.0/instrument.ts on integration.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'erica16', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Emotion Regulation Index for Children and Adolescents', abbreviation: 'ERICA', instrumentFamily: 'Emotion Regulation Index for Children and Adolescents' },
    construct: { primaryDomain: 'SELF_REGULATION', secondaryDomains: ['SOCIAL_EMOTIONAL'], constructDefinition: '儿童青少年自评的情绪调节，包括情绪控制、情绪自我觉察和情境回应。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "construct:sel_erica16_dimension_1", "construct:sel_erica16_dimension_2", "construct:sel_erica16_dimension_3", 'emotion_regulation', 'emotional_control', 'emotional_self_awareness', 'situational_responsiveness', 'child_adolescent_self_report'] },
    population: { minAge: 9, maxAge: 16, populationNotes: '原始心理测量研究为澳大利亚 9–16 岁学生；中文工作表达尚未验证。', respondentTypes: ['SELF'], developmentalEvidence: 'ESTABLISHED' },
    administration: { itemCount: 16, estimatedMinutes: 5, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '一般自我描述，无指定回忆时段', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['保留作者问卷 16 题顺序及五点同意度选项。', '十个反向题的分值须统一方向后再计分。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }, { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '产品的自我反思反馈不构成临床判断。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'macdermott-erica-2010', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Australian children and adolescents aged 9–16', ageRange: '9–16 years', locale: 'en', territory: 'AU', sampleSize: 1389, studyDesign: 'Scale development, factor analysis, internal consistency and four-week retest in a subset.', rating: 'MIXED', citation: 'MacDermott ST, Gullone E, Allen JS, King NJ, Tonge BJ. The Emotion Regulation Index for Children and Adolescents (ERICA): A Psychometric Investigation. Journal of Psychopathology and Behavioral Assessment. 2010;32:301–314.', doi: '10.1007/s10862-009-9154-0', url: 'https://doi.org/10.1007/s10862-009-9154-0', notes: '原研究自我觉察和情境回应内部一致性分别为 .60 和 .64；对单人分数和中文改写须谨慎。' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'The ERICA: Items and Scoring', citation: 'MacDermott et al. (2010), Journal of Psychopathology and Behavioral Assessment, 32, 301–314.', url: 'https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erica_items_scoring.pdf', publicationYear: 2010 },
    reportPlan: { dimensionLabels: ['情绪控制', '情绪自我觉察', '情境回应'], limitations: ['自评受到情境和语言理解影响；部分维度原始研究信度较低。', '中文工作表达尚未验证；不提供常模或临床界线。'], disclaimer: '用于自我反思，不用于诊断或高风险决策。' },
    blockers: ['完整可交付题干和逐题中文译文尚缺；不得作为可施测版本。', '静态反馈样稿尚未接入动态报告及缺答分支。'],
  },
} satisfies ScaleInstrumentSourceV1
