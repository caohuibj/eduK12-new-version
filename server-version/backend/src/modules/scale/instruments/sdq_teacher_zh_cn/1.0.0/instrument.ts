import type { ScaleCatalogManifestV1 } from '../../../library/catalog-manifest'
import type { LocalizationManifestV1 } from '../../../library/localization-manifest'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { DISCLOSURE_PRESETS } from '../../../policy/disclosure'
import { standardIntendedUse } from '../../catalog-defaults'
import { SDQ_TEACHER_EN_T4_10_V1_PACKAGE } from '../../../packages/sdq-teacher-en-t4-10-v1'
import { SDQ_TEACHER_SCORER_KEY, sdqTeacherT410Scorer } from '../../../packages/sdq-teacher-impact-scorer'

const catalog: ScaleCatalogManifestV1 = {
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'ACCEPTED',
  scientificMaturity: 'PILOT',
  identity: {
    instrumentKey: 'sdq_teacher_zh_cn',
    instrumentVersion: '1.0.0',
    canonicalName: 'Strengths and Difficulties Questionnaire — Teacher T4–10',
    abbreviation: 'SDQ Teacher T4–10',
    instrumentFamily: 'Strengths and Difficulties Questionnaire',
  },
  construct: {
    primaryDomain: 'BEHAVIORAL_DIFFICULTIES',
    secondaryDomains: ['SOCIAL_EMOTIONAL', 'TEACHER_OBSERVATION'],
    constructDefinition: '教师对 4–10 岁儿童情绪、行为、注意、同伴关系、亲社会行为及影响的观察描述。',
    constructLevel: 'BROAD_DOMAIN',
    constructOverlapTags: ['sdq', 'teacher_report', 'impact_supplement'],
  },
  population: {
    minAge: 4,
    maxAge: 10,
    populationNotes: '教师 T4–10 版本；当前包的可执行内容为英文来源，zh-CN 翻译仍受既有 gate 约束。',
    respondentTypes: ['TEACHER'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 29,
    estimatedMinutes: 8,
    administrationModes: ['DIGITAL_SUPERVISED'],
    timeFrame: '过去六个月或本学年',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [],
  },
  intendedUse: standardIntendedUse,
  evidence: [
    {
      evidenceId: 'sdq-cn-du-2008',
      evidenceType: 'CROSS_CULTURAL_VALIDITY',
      population: '上海 12 个行政区幼儿园、小学和中学的 3–17 岁儿童青少年；家长、教师及 11–17 岁自评',
      ageRange: '3–17 years; self-report 11–17 years',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1965,
      studyDesign: 'Community epidemiological psychometric study; parent/teacher/self-report reliability, factor structure, convergent/discriminant validity and local descriptive norms',
      rating: 'MIXED',
      citation: 'Du Y, Kou J, Coghill D. (2008). The validity, reliability and normative scores of the parent, teacher and self report versions of the Strengths and Difficulties Questionnaire in China. Child and Adolescent Psychiatry and Mental Health, 2, 8.',
      doi: '10.1186/1753-2000-2-8',
      url: 'https://doi.org/10.1186/1753-2000-2-8',
      notes: '家长/教师完整数据 n=1,965，自评完整三方数据 n=690。五因子结构仅部分复现；该证据不自动激活平台 banding/cut-off 或当前英文 Teacher runtime 的中文 exact-form 声称。',
    },
  ],
  referenceApplicability: [],
}
const localization: LocalizationManifestV1 = {
  ...{
    instrumentKey: catalog.identity.instrumentKey,
    instrumentVersion: catalog.identity.instrumentVersion,
    sourceLocale: 'en',
    targetLocale: 'en',
    translationSource: 'SDQ Teacher T4–10 English source form',
    adaptationMethod: 'ORIGINAL_SOURCE',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    localEvidenceRefs: [],
    notes: 'product key 保留 zh_cn 历史命名；当前可执行内容与 catalog 目标 locale 均为 en。',
  },
  schemaVersion: 1,
  localizationVersion: '1.0.0',
  reviewStatus: 'APPROVED',
  reviewedAt: '2026-09-01T00:00:00Z',
}
const { instrumentKey, instrumentVersion, ...catalogIdentity } = catalog.identity
const { instrumentKey: _lk, instrumentVersion: _lv, ...localizationBody } = localization

export const SCALE_INSTRUMENT_SOURCE = {
  schemaVersion: 1,
  identity: { instrumentKey, instrumentVersion },
  catalog: { ...catalog, identity: catalogIdentity },
  localization: localizationBody,
  applicability: {
    schemaVersion: 1,
    policyVersion: 'pr4-migrated-v1',
    respondentTypes: ['TEACHER'],
    subject: { ageMonths: { minInclusive: 48, maxExclusive: 132 } },
    requiredContextKeys: [],
  },
  disclosure: {
    schemaVersion: 1,
    policyVersion: 'legacy-migrated-v1',
    audiences: {
      respondent: DISCLOSURE_PRESETS.FULL_REPORT(),
      subject: DISCLOSURE_PRESETS.FULL_REPORT(),
      teacher: DISCLOSURE_PRESETS.FULL_REPORT(),
      researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
    },
    unknownAudience: 'DENY',
  },
  usageRequirements: {
    schemaVersion: 1,
    policyVersion: 'pr4-migrated-v1',
    requiredRightsActions: ["electronicAdministration","scoring","display"],
    
    notes: ['Migrated from reviewed legacy deployment gates; durable grants remain in InstrumentAuthorization.'],
  },
  executable: {
    releaseStatus: 'PUBLISHED',
    contentLocale: localization.targetLocale,
    definition: SDQ_TEACHER_EN_T4_10_V1_PACKAGE.definition,
    references: SDQ_TEACHER_EN_T4_10_V1_PACKAGE.references,
    goldenCases: SDQ_TEACHER_EN_T4_10_V1_PACKAGE.goldenCases,
      scorerPlugins: [{ key: SDQ_TEACHER_SCORER_KEY, version: SDQ_TEACHER_EN_T4_10_V1_PACKAGE.definition.scoring.scoringVersion, scorer: sdqTeacherT410Scorer }],
  },
} satisfies ScaleInstrumentSourceV1
