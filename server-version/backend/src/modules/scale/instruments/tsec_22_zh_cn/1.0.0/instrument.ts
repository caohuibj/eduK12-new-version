// Catalog-only candidate registration; full item text not copied to this repository.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey: 'tsec_22_zh_cn', instrumentVersion: '1.0.0' },
  catalog: {
    schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
    identity: { canonicalName: 'Teachers\u2019 Social-Emotional Competence Scale (TSEC)', abbreviation: 'TSEC-22', instrumentFamily: 'Teachers\u2019 Social-Emotional Competence Scale' },
    construct: { primaryDomain: 'SOCIAL_EMOTIONAL', secondaryDomains: [], constructDefinition: '教师自评的社会情感能力，含自我情绪驾驭（SEM）、专业关系建设与专业事务责任三个维度，共 22 题。', constructLevel: 'SPECIFIC_CONSTRUCT', constructOverlapTags: ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:sel_context", "population:teachers", "response:teacher_self", "use:reflection", "use:research", "language_validation:chinese_original", "construct:sel_tsec_self_emotional_mastery", "construct:sel_tsec_professional_relationship_building", "construct:sel_tsec_professional_affairs_responsibility", "teacher_self_report", "teacher_sec", "self_report"] },
    population: { populationNotes: '原研究为中国职前教师两组样本合计 1,474 人；在职教师适用性需另行验证。中文为施测原版（另有专家英文译文用于发表）。', respondentTypes: ['SELF'], developmentalEvidence: 'PARTIAL' },
    administration: { itemCount: 22, estimatedMinutes: 6, administrationModes: ['DIGITAL_SELF_ADMINISTERED', 'DIGITAL_SUPERVISED', 'PAPER'], timeFrame: '一般自我描述', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true, layoutConstraints: ['七点计分：1 = 完全不同意 至 7 = 完全同意。', '三个维度分别计分；SEM 1\u20136 题、专业关系建设 7\u201314 题、专业事务责任 15\u201322 题（以论文附录为准）。'] },
    intendedUse: { intendedUses: [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }, { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'EVIDENCE_UNKNOWN', notes: '教师发展性反思，不作为考核。' }], forbiddenUses: ['DIAGNOSIS', 'HIGH_STAKES_SELECTION', 'SCHOOL_RANKING', 'TEACHER_ACCOUNTABILITY', 'UNSUPPORTED_GROUP_COMPARISON'] },
    evidence: [{ evidenceId: 'guo-tsec-2026', evidenceType: 'STRUCTURAL_VALIDITY', population: 'Chinese pre-service teachers, two samples, N = 1,474', locale: 'zh', territory: 'CN', studyDesign: 'Scale development and validation of the 22-item TSEC with Chinese originals and expert English translations published in the online appendix.', rating: 'SUFFICIENT', citation: 'Guo R. Development and validation of the teachers\u2019 social-emotional competence scale (TSEC scale). Current Psychology. 2026;45:779.', doi: '10.1007/s12144-026-09348-3', url: 'https://link.springer.com/article/10.1007/s12144-026-09348-3', notes: '正文为订阅内容；附录量表在文章页面公开可见。论文 2026-03-31 发表。' }],
    referenceApplicability: [],
  },
  candidatePreview: {
    status: 'CATALOG_ONLY',
    source: { title: 'Development and validation of the teachers\u2019 social-emotional competence scale (TSEC scale)', citation: 'Guo R. Current Psychology. 2026;45:779.', url: 'https://link.springer.com/article/10.1007/s12144-026-09348-3', publicationYear: 2026 },
    reportPlan: { dimensionLabels: ['自我情绪驾驭', '专业关系建设', '专业事务责任'], limitations: ['原样本为职前教师，在职教师使用需另行验证。', '文章为订阅内容，题文再分发许可未确认。'], disclaimer: '教师发展性反思，不用于考核或排名。' },
    blockers: ['Springer 文章为订阅内容（出版协议下独家授权），附录 22 题虽在文章页面公开可见，整套题文的再分发权利未确认；须联系作者或出版社。', '正式计分键（维度均值规则）需随全文一并获取核对。'],
  },
} satisfies ScaleInstrumentSourceV1
