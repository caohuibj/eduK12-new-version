import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'bessi_45_self_zh_cn', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1,
    catalogManifestVersion: 1,
    catalogStatus: 'CANDIDATE',
    scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Behavioral, Emotional, and Social Skills Inventory — 45-item Self-Report', abbreviation: 'BESSI-45', instrumentFamily: 'BESSI' },
    construct: {
      primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: [], constructLevel: 'BROAD_DOMAIN',
      constructDefinition: '对社会、情绪及行为相关技能能做得多好的自我评价，分为五个领域。',
      constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "license:noncommercial", "construct:sel_bessi45_dimension_1", "construct:sel_bessi45_dimension_2", "construct:sel_bessi45_dimension_3", "construct:sel_bessi45_dimension_4", "construct:sel_bessi45_dimension_5", 'self_management', 'social_engagement', 'cooperation', 'emotional_resilience', 'innovation', 'self_report'],
    },
    population: { respondentTypes: ['SELF'], developmentalEvidence: 'PARTIAL', populationNotes: '官方说明原工具为青少年和成人开发；不把儿童他评证据当作儿童自评证据。' },
    administration: { itemCount: 45, estimatedMinutes: 5, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '一般技能自评，无指定回忆时段', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['保持五点能力作答语义；不改为频率或喜好。'] },
    intendedUse: { intendedUses: [{ use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'bessi-short-forms', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Short-form BESSI validation samples', locale: 'en', territory: 'US', studyDesign: 'Development and validation of 96-, 45-, and 20-item BESSI short forms.', rating: 'MIXED', citation: 'Sewell MN et al. Assessing Social, Emotional, and Behavioral Skills in Just a Few Minutes: 96-, 45-, and 20-Item Short Forms of the BESSI. Assessment. doi:10.1177/10731911241256434.', doi: '10.1177/10731911241256434', url: 'https://doi.org/10.1177/10731911241256434' }],
    referenceApplicability: [],
  },
  localization: { schemaVersion: 1, sourceLocale: 'en', targetLocale: 'zh-CN', localizationVersion: '1.0.0', translationSource: '官网提供中文自陈版；本目录未复制其题文。', adaptationMethod: 'DIRECT_TRANSLATION', expertReviewStatus: 'PENDING', cognitiveDebriefStatus: 'NOT_ESTABLISHED', localEvidenceRefs: [], reviewStatus: 'PENDING', notes: '没有将官网中文版的验证结论外推到本目录的报告样稿。' },
  applicability: { schemaVersion: 1, policyVersion: 'bessi-45-self-v1', respondentTypes: ['SELF'], requiredContextKeys: [] },
  disclosure: { schemaVersion: 1, policyVersion: 'bessi-45-self-v1', audiences: { respondent: { numericScores: true, references: false, individualInterpretations: true, scoreDerivedLabels: false, resultQualityDetails: true, rawAnswers: false, itemScores: false, methods: true, educationalContent: false } }, unknownAudience: 'DENY' },
  usageRequirements: { schemaVersion: 1, policyVersion: 'bessi-45-self-v1', requiredRightsActions: ['electronicAdministration', 'scoring', 'display'], allowedCommercialNatures: ['NON_COMMERCIAL', 'COMMERCIAL'], notes: ['官网说明非商业使用免费，商业使用需许可；公开仓库再分发及具体部署权利未核实。'] },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'BESSI-45 Self-Report Form', url: 'https://www.sebskills.com/the-bessi.html' },
    reportPlan: { dimensionLabels: ['自我管理', '社交参与', '合作', '情绪复原', '创新'], limitations: ['自评反映一次作答，不是客观能力或人群比较。', '本记录目前没有可执行题本。'], disclaimer: '结果用于个人反思，不用于诊断或排名。' },
    blockers: ['官方题本保留所有权利，官网明确商业使用需许可；公开仓库再分发权利未确认。题文验收未通过，未提供可执行定义。'],
  },
} satisfies ScaleInstrumentSourceV1
