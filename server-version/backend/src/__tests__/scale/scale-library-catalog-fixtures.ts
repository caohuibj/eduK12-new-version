/**
 * Scale Library catalog 测试共享 fixtures。
 * validCatalogManifestBase 随 SL1-C1..C5 的 section 逐个扩展，
 * 各 contract 测试文件从它派生非法变体。
 */
import type { ScaleCatalogManifestV1 } from '../../modules/scale/library/catalog-manifest'

export const validCatalogManifestBase = (): ScaleCatalogManifestV1 => ({
  schemaVersion: 1,
  catalogManifestVersion: 1,
  catalogStatus: 'REVIEWED',
  identity: {
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    canonicalName: 'WHO-5 Well-Being Index',
    abbreviation: 'WHO-5',
    instrumentFamily: 'WHO Well-Being Index family',
  },
  construct: {
    primaryDomain: 'WELL_BEING',
    secondaryDomains: [],
    constructDefinition: '主观幸福感：近期内个体对自身生活整体的正负评价。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: ['quality_of_life', 'positive_affect'],
  },
  population: {
    minAge: 9,
    maxAge: 18,
    gradeRange: { minGrade: 3, maxGrade: 12 },
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 5,
    estimatedMinutes: 3,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED'],
    timeFrame: '过去两周',
    requiredTraining: false,
    itemOrderLocked: false,
    responseFormatLocked: true,
  },
  intendedUse: {
    intendedUses: [
      { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
      { use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'SUPPORTED' },
      { use: 'PROGRESS_MONITORING', evidenceStatus: 'EVIDENCE_UNKNOWN' },
    ],
    forbiddenUses: ['DIAGNOSIS'],
  },
  evidence: [
    {
      evidenceId: 'evidence-internal-consistency-cn-2020',
      evidenceType: 'INTERNAL_CONSISTENCY',
      population: '中国大陆小学生样本',
      ageRange: '9-12',
      locale: 'zh-CN',
      territory: 'CN',
      sampleSize: 1200,
      studyDesign: '横断面调查',
      rating: 'SUFFICIENT',
      citation: '示例文献：某中文版内部一致性验证研究, 2020',
      doi: '10.0000/example.2020.001',
    },
    {
      evidenceId: 'evidence-structural-validity-uk-2011',
      evidenceType: 'STRUCTURAL_VALIDITY',
      population: '英国学龄儿童样本',
      ageRange: '8-15',
      locale: 'en',
      territory: 'UK',
      sampleSize: 800,
      studyDesign: '验证性因子分析',
      rating: 'MIXED',
      citation: '示例文献：某英文版结构效度研究, 2011',
      url: 'https://example.org/study/2011',
    },
  ],
  referenceApplicability: [
    {
      applicabilityId: 'ref-applicability-cn-2020',
      referenceVersion: 'who5-cn-2020-v1',
      referenceKind: 'descriptive_sample',
      respondent: 'SELF',
      locale: 'zh-CN',
      territory: 'CN',
      minAgeMonthsInclusive: 108,
      maxAgeMonthsExclusive: 216,
      sampleN: 1200,
      samplingMethod: 'STRATIFIED',
      collectionYears: '2019-2020',
      notes: '描述性样本参考，非中国大陆正式常模。',
    },
  ],
})
