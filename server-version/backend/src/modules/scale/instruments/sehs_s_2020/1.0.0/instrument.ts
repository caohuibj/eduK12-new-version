// Catalog-only candidate registration; full item text not copied to this repository.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'sehs_s_2020', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Social and Emotional Health Survey—Secondary (2020 revision)', abbreviation: 'SEHS-S 2020', instrumentFamily: 'Social Emotional Health Survey' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: ['POSITIVE_DEVELOPMENT'], constructDefinition: '中学生自评的积极社会情绪健康资源（Covitality 思路），涵盖自我信念、他人信任、情绪能力与积极生活参与。', constructLevel: 'BROAD_DOMAIN', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "domain:positive_development", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_sehs_covitality", "covitality", "positive_development", "self_report"] },
    population: { populationNotes: '面向中学阶段学生；测量积极发展资源，不应直接当作纯 CASEL SEC 总分使用。', respondentTypes: ['SELF'], developmentalEvidence: 'ESTABLISHED' },
    administration: { itemCount: 36, estimatedMinutes: 10, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '一般自我描述', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['手册问卷正文与计分工作表存在题号对应疑点，须逐题核对后才能冻结计分版本。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }, { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '积极发展反馈不构成临床判断。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'furlong-sehs-s-2014', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Secondary school students, multiple samples', locale: 'en', territory: 'US', studyDesign: 'Covitality model validation of the SEHS-S with higher-order factor structure.', rating: 'SUFFICIENT', citation: 'Furlong MJ, You S, Renshaw TL, O\u2019Malley MD, Rebelez J. Preliminary development of the Positive Experiences at School Scale for adolescents. / SEHS-S technical documentation (UCSB).', url: 'https://files.eric.ed.gov/fulltext/ED600109.pdf', notes: 'UCSB 54 页技术手册（ERIC ED600109）公开提供完整问卷与计分资料；引用以手册页为准。' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'Social and Emotional Health Survey—Secondary Technical Manual (2020)', citation: 'Furlong MJ, Dowdy E, et al. UC Santa Barbara SEHS-S technical documentation.', url: 'https://files.eric.ed.gov/fulltext/ED600109.pdf', publicationYear: 2020 },
    reportPlan: { dimensionLabels: ['自我信念', '他人信任（社会支持）', '情绪能力', '积极参与', 'Covitality 总指标'], limitations: ['积极发展资源测量，不能解释为纯 SEC 或临床症状。', '题号映射未经逐题复核前不得发布计分版本。'], disclaimer: '用于积极发展反思，不用于诊断或排名。' },
    blockers: ['手册问卷正文与计分工作表之间的题号对应问题需逐题核实；解决前不进入可执行定义。', '完整题文誊录与资料包待建。'],
  },
} satisfies ScaleInstrumentSourceV1
