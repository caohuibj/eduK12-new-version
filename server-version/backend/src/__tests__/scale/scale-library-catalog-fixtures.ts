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
})
