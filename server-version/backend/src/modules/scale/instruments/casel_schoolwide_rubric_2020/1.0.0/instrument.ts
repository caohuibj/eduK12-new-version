import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Discovery metadata only. This school-level rubric is a Form, never a Scale.
export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'casel_schoolwide_rubric_2020', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1,
    catalogManifestVersion: 1,
    catalogStatus: 'CANDIDATE',
    scientificMaturity: 'PILOT',
    identity: { canonicalName: 'CASEL Schoolwide SEL Implementation Rubric (2020)', abbreviation: 'CASEL Schoolwide Rubric', instrumentFamily: 'CASEL Schoolwide SEL implementation tools' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: ['SCHOOL_CLIMATE'], constructDefinition: '学校层面的SEL实施进展、条件、实践和持续改进，不是学生个人社会情绪能力测量。', constructLevel: 'BROAD_DOMAIN', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:sel_context", "orientation:casel", "population:school_teams", "response:implementation_review", "use:reflection", "use:sel_implementation_evaluation", "license:noncommercial", "construct:sel_casel_rubric_dimension_1", "construct:sel_casel_rubric_dimension_2", "construct:sel_casel_rubric_dimension_3", "construct:sel_casel_rubric_dimension_4", "construct:sel_casel_rubric_dimension_5", 'schoolwide_implementation', 'school_team_reflection', 'sel_planning', 'continuous_improvement'] },
    population: { populationNotes: '学校SEL团队共同讨论、收集证据和规划行动；单位是学校，不是学生。', respondentTypes: ['OBSERVER'], developmentalEvidence: 'UNKNOWN' },
    administration: { itemCount: 23, estimatedMinutes: 45, administrationModes: ['PAPER'], timeFrame: '学校当前实施情况；回顾时点由团队记录', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['23个指标分布于1A、1B、2、3、4；题目原四级行为描述须对照CASEL原量规。', '用时为产品估计，完整讨论通常可能更久；不提供总分、学生常模或诊断。'] },
    intendedUse: { intendedUses: [{ use: 'PROGRAM_EVALUATION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '学校团队用于自我反思和规划，非有常模的绩效评估。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [], referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'CASEL Schoolwide SEL Implementation Rubric', url: 'https://files.casel.org/sites/2/2019/06/Blank-Rubric-Template-3.30.20.pdf', publicationYear: 2020 },
    reportPlan: { dimensionLabels: ['1A 基础支持', '1B 共同计划', '2 成人SEL', '3 学生SEL', '4 持续改进'], limitations: ['学校实施过程的记录，不是个人能力或学校排名。', '原量规的各行为锚点没有嵌入记录表；应对照原始材料及其使用条款。'], disclaimer: '用于学校团队共同反思、查找证据和规划行动，不用于学生诊断或绩效选拔。' },
    blockers: ['原量规受CASEL使用条款约束，学校版许可限定美国境内、非商业且附带衍生作品义务；记录表未复用四级行为锚点。', '本记录无Scale executable，不能当作个人量表。'],
  },
} satisfies ScaleInstrumentSourceV1
