import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'air_educator_sec_2022', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Self-Assessing Educator Social and Emotional Competencies and Instruction — Educator Competencies', abbreviation: 'AIR Educator SEC', instrumentFamily: 'AIR Educator SEL Self-Reflection Tool' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: ['SELF_REGULATION'], constructDefinition: '教师对个人社会情绪能力及其与学生互动关联的反思；与教学实践部分独立。', constructLevel: 'BROAD_DOMAIN', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "orientation:casel", "population:teachers", "response:teacher_self", "use:reflection", "use:research", "construct:sel_air_educator_dimension_1", "construct:sel_air_educator_dimension_2", "construct:sel_air_educator_dimension_3", "construct:sel_air_educator_dimension_4", "construct:sel_air_educator_dimension_5", 'educator_self_reflection','self_awareness','self_management','social_awareness','relationship_skills','responsible_decision_making'] },
    population: { respondentTypes: ['SELF'], developmentalEvidence: 'UNKNOWN', populationNotes: '教师、学校工作人员与校外教育人员对自身作答；不适用于学生自评。工具未经实证检验。' },
    administration: { itemCount: 36, estimatedMinutes: 10, administrationModes: ['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'], timeFrame: '一般教学经历与能力反思', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['个人SEC与十项教学实践独立；不合成总分。', '五个能力维度分别包含7、7、7、8、7项。'] },
    intendedUse: { intendedUses: [{ use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '作者定位为自我反思与专业学习，2022版未经实证测试。' }], forbiddenUses: ['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [], referenceApplicability: [],
  },
  applicability: { schemaVersion: 1, policyVersion: 'air-educator-sec-v1', respondentTypes: ['SELF'], requiredContextKeys: [] },
  disclosure: { schemaVersion: 1, policyVersion: 'air-educator-sec-v1', audiences: { respondent: { numericScores: true, references: false, individualInterpretations: true, scoreDerivedLabels: false, resultQualityDetails: true, rawAnswers: false, itemScores: false, methods: true, educationalContent: false } }, unknownAudience: 'DENY' },
  usageRequirements: { schemaVersion: 1, policyVersion: 'air-educator-sec-v1', requiredRightsActions: ['electronicAdministration','scoring','display'], notes: ['原文末页声明 AIR 版权所有；具体复制、改编和部署许可未确认。'] },
  candidatePreview: { status: 'CATALOG_ONLY', source: { title: 'Self-Assessing Educator Social and Emotional Competencies and Instruction (Refreshed)', citation: 'Yoder N. American Institutes for Research, October 2022.', url: 'https://www.air.org/sites/default/files/2022-12/GTL-Educator-Self-Assessment-Refreshed-2014-508.pdf', publicationYear: 2022 }, reportPlan: { dimensionLabels: ['自我觉察','自我管理','社会觉察','关系技能','负责任决策'], limitations: ['工具旨在专业反思，2022版未经实证测试。','目录条目不包含可执行题本。'], disclaimer: '仅供个人反思和专业学习，不用于绩效或高风险决策。' }, blockers: ['2022工具末页标注AIR all rights reserved，公开仓库再分发或翻译完整题文的许可未确认；题文验收未通过。'] },
} satisfies ScaleInstrumentSourceV1
