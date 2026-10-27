// Copy to src/modules/scale/instruments/erq_ca_5point/1.0.0/instrument.ts on integration.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'erq_ca_5point', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Emotion Regulation Questionnaire for Children and Adolescents', abbreviation: 'ERQ-CA', instrumentFamily: 'Emotion Regulation Questionnaire' },
    construct: { primaryDomain: 'SELF_REGULATION', secondaryDomains: ['SOCIAL_EMOTIONAL'], constructDefinition: '儿童青少年自陈使用认知重评和表达抑制两种情绪调节策略的倾向。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "construct:sel_erq_ca_dimension_1", "construct:sel_erq_ca_dimension_2", 'emotion_regulation', 'cognitive_reappraisal', 'expressive_suppression', 'child_adolescent_self_report'] },
    population: { minAge: 10, maxAge: 18, populationNotes: '原始心理测量研究样本 10–18 岁；仅代表其证据范围。中文五点版本工作表达尚未完成验证。', respondentTypes: ['SELF'], developmentalEvidence: 'ESTABLISHED' },
    administration: { itemCount: 10, estimatedMinutes: 5, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '通常的自我描述；无指定回忆时段', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['使用儿童青少年版五点同意度选项；不混同成人 ERQ 七点格式。', '认知重评 6 题，表达抑制 4 题；不提供两策略合并总分。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }, { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '非学术反馈为产品设计，不能解释为诊断或能力等级。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'gullone-taffe-2012', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Australian children and adolescents', ageRange: '10–18 years', locale: 'en', territory: 'AU', sampleSize: 827, studyDesign: 'Psychometric evaluation of two-factor structure and validity with longitudinal follow-up.', rating: 'SUFFICIENT', citation: 'Gullone E, Taffe J. The Emotion Regulation Questionnaire for Children and Adolescents: a psychometric evaluation. Psychological Assessment. 2012;24(2):409–417.', doi: '10.1037/a0025777', url: 'https://doi.org/10.1037/a0025777', notes: '原论文 2011 在线发表，2012 年正式刊载。作者题本 5 点；不得用成人版七点评分。' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'Emotion Regulation Questionnaire for Children and Adolescents (ERQ-CA)', citation: 'Gullone & Taffe (2012), Psychological Assessment, 24(2), 409–417.', url: 'https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erq-ca.pdf', publicationYear: 2012 },
    reportPlan: { dimensionLabels: ['认知重评', '表达抑制'], limitations: ['描述两种自陈策略，不评判哪一种一定更好。', '自评受环境、关系及当时感受影响。', '中文五点工作表达未验证；不提供常模或临床阈值。'], disclaimer: '用于认识策略和反思，不用于诊断、人格评价或高风险决策。' },
    blockers: ['尚未交付完整英文原题：作者提供题本下载，但未查到明确的完整题文再分发许可；当前生成过程不能复制整套受保护题文。', '静态报告样稿尚未适配运行时和缺答分支。'],
  },
} satisfies ScaleInstrumentSourceV1
