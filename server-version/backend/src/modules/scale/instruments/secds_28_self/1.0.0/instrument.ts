import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'secds_28_self', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Social-Emotional and Character Development Scale — 28-item', abbreviation: 'SECDS-28', instrumentFamily: 'SECDS' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: ['SELF_REGULATION'], constructDefinition: '学生对亲社会行为、诚实、自我发展、自我控制、学校与家庭尊重相关描述的自评。', constructLevel: 'BROAD_DOMAIN', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "construct:sel_secds28_dimension_1", "construct:sel_secds28_dimension_2", "construct:sel_secds28_dimension_3", "construct:sel_secds28_dimension_4", "construct:sel_secds28_dimension_5", "construct:sel_secds28_dimension_6", 'prosocial_behavior','honesty','self_development','self_control','respect_at_school','respect_at_home','self_report'] },
    population: { respondentTypes: ['SELF'], developmentalEvidence: 'PARTIAL', populationNotes: '原研究随访美国城市小学三至五年级学生；不得把该样本当作本地常模。' },
    administration: { itemCount: 28, estimatedMinutes: 8, administrationModes: ['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'], timeFrame: '一般自我描述，无指定回忆期', requiredTraining: false, itemOrderLocked: false, responseFormatLocked: true, layoutConstraints: ['原研究题目随机呈现；按四级同意度回答，不能变成频率作答。'] },
    intendedUse: { intendedUses: [{ use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN' }], forbiddenUses: ['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'secds-ji-dubois-flay', evidenceType: 'STRUCTURAL_VALIDITY', population: 'US urban elementary-school students followed in grades 3–5', locale: 'en', territory: 'US', studyDesign: 'Five-wave factor structure and initial validation; self-report.', rating: 'MIXED', citation: 'Ji P, DuBois DL, Flay BR. Social-Emotional and Character Development Scale: Development and Initial Validation With Urban Elementary School Students. Journal of Research in Character Education 9(2):121–147.', doi: '10.1108/CE-12-2011-0003', url: 'https://doi.org/10.1108/CE-12-2011-0003' }],
    referenceApplicability: [],
  },
  applicability: { schemaVersion: 1, policyVersion: 'secds28-self-v1', respondentTypes: ['SELF'], requiredContextKeys: [] },
  disclosure: { schemaVersion: 1, policyVersion: 'secds28-self-v1', audiences: { respondent: { numericScores: true, references: false, individualInterpretations: true, scoreDerivedLabels: false, resultQualityDetails: true, rawAnswers: false, itemScores: false, methods: true, educationalContent: false } }, unknownAudience: 'DENY' },
  usageRequirements: { schemaVersion: 1, policyVersion: 'secds28-self-v1', requiredRightsActions: ['electronicAdministration','scoring','display'], notes: ['原论文发布页标注 Licensed re-use rights only；28题原文及翻译公开再分发权利未确认。'] },
  candidatePreview: { status: 'CATALOG_ONLY', source: { title: 'Social-Emotional and Character Development Scale', citation: 'Ji P, DuBois DL, Flay BR. Social-Emotional and Character Development Scale.', url: 'https://doi.org/10.1108/CE-12-2011-0003' }, reportPlan: { dimensionLabels: ['亲社会','诚实','自我发展','自我控制','学校中的尊重','家中的尊重'], limitations: ['结果反映一次学生自评。', '目录条目没有可执行题本。'], disclaimer: '用于个人反思，不用于诊断或排名。' }, blockers: ['28题原文来自标注仅限许可再使用的原论文；未取得明确公开再分发依据，因此题文验收未通过。'] },
} satisfies ScaleInstrumentSourceV1
