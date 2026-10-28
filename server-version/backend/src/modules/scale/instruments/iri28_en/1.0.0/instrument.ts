// Catalog-only candidate registration; full item text not copied to this repository.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'iri28_en', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Interpersonal Reactivity Index (IRI)', abbreviation: 'IRI', instrumentFamily: 'Interpersonal Reactivity Index' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: [], constructDefinition: '自评的多维共情倾向：观点采择、共情关注、想象与个人痛苦四个独立维度。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:adult", "response:student_self", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_iri_perspective_taking", "construct:sel_iri_empathic_concern", "construct:sel_iri_fantasy", "construct:sel_iri_personal_distress", "empathy", "perspective_taking", "empathic_concern", "personal_distress", "self_report"] },
    population: { populationNotes: '原始版本为成人自评；青少年使用需独立证据，不直接外推。与库内 BES-20（认知/情感共情）、EAQ30 相邻，构念边界见查重记录。', respondentTypes: ['SELF'], developmentalEvidence: 'ESTABLISHED' },
    administration: { itemCount: 28, estimatedMinutes: 10, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'PAPER'], timeFrame: '一般自我描述', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['保留四维归属与作者反向题标识；四维独立计分，不合成单一共情总分。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'davis-iri-1983', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Adult samples (male/female) across four studies', locale: 'en', territory: 'US', studyDesign: 'Multidimensional individual-difference approach to empathy; four 7-item subscales with reliability data.', rating: 'SUFFICIENT', citation: 'Davis MH. Measuring individual differences in empathy: Evidence for a multidimensional approach. Journal of Personality and Social Psychology. 1983;44(1):113–126.', doi: '10.1037/0022-3514.44.1.113', url: 'https://doi.org/10.1037/0022-3514.44.1.113' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'Interpersonal Reactivity Index (IRI) — items and scoring', citation: 'Davis MH (1980/1983); university-hosted copy of the 28-item scale with reverse-key marks.', url: 'https://www.ucdenver.edu/docs/librariesprovider54/wellbeing-documents/interpersonalreactivityindex.pdf', publicationYear: 1983 },
    reportPlan: { dimensionLabels: ['观点采择', '共情关注', '想象', '个人痛苦'], limitations: ['四个维度相互独立，不合成总分。', '成人工具；用于青少年前需独立验证。'], disclaimer: '用于自我反思，不用于诊断或排名。' },
    blockers: ['题文来源为大学页面公开复制版，作者（Davis）许可状态未确认；需核对官方来源与再分发条件。', '反向题清单与四维题号需随正式授权一并核对。'],
  },
} satisfies ScaleInstrumentSourceV1
