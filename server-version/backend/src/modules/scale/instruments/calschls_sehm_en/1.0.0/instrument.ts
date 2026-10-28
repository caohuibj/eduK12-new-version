// Catalog-only candidate registration; full item text not copied to this repository.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'calschls_sehm_en', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'CalSCHLS Social Emotional Health Module (2025\u201326)', abbreviation: 'CalSCHLS SEHM', instrumentFamily: 'California School Climate, Health, and Learning Surveys' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: ['SCHOOL_CONTEXT'], constructDefinition: '加州中学生调查中的社会情绪健康模块，混合 SEL 能力自评与学校情境条目，非纯 SEC 工具。', constructLevel: 'BROAD_DOMAIN', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:school_context", "population:k12", "response:student_self", "use:research", "use:reflection", "language_validation:english_original", "construct:sel_calschls_sehm", "school_survey", "student_self"] },
    population: { populationNotes: '面向加州中学系统；模块混合能力与情境内容，需按模块原始结构使用。', respondentTypes: ['SELF'], developmentalEvidence: 'PARTIAL' },
    administration: { itemCount: 43, estimatedMinutes: 12, administrationModes: ['DIGITAL_SELF_ADMINISTERED'], timeFrame: '近况回顾', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['模块含多类条目与混合作答标尺，不得当作单一量表施测。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'EVIDENCE_UNKNOWN' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'calschls-sehm-2025', evidenceType: 'CONTENT_VALIDITY', population: 'California secondary students', locale: 'en', territory: 'US', studyDesign: 'State survey module administered within CalSCHLS system.', rating: 'UNKNOWN', citation: 'CalSCHLS Social Emotional Health Module, 2025\u201326 version. California Department of Education / WestEd.', url: 'https://calschls.org/site/assets/files/1103/mshs-sehm-2526_final_watermarked.pdf', notes: '官方参考问卷公开（水印版）；模块计分与再分发条款未核。' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'CalSCHLS Social Emotional Health Module (2025\u201326) reference questionnaire', citation: 'California School Climate, Health, and Learning Surveys system.', url: 'https://calschls.org/site/assets/files/1103/mshs-sehm-2526_final_watermarked.pdf', publicationYear: 2025 },
    reportPlan: { dimensionLabels: ['按模块原始子量表（待计分核实后登记）'], limitations: ['混合模块，非纯 SEC；不可与学生个人 SEC 总分混合。'], disclaimer: '用于学校调查情境，不用于个体诊断。' },
    blockers: ['模块计分规则与子量表结构未核；官方水印问卷的再分发/电子化施测条款未确认，须联系 CalSCHLS/WestEd。', '43 题逐题誊录与资料包待建。'],
  },
} satisfies ScaleInstrumentSourceV1
