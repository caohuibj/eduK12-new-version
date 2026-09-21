import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import type { AssessmentReferenceSetDefinition } from '../../modules/assessment-reference/reference'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'
import {
  createInstrumentAuthorizationDraft,
  amendApprovedInstrumentAuthorization,
  approveInstrumentAuthorization,
} from '../../modules/assessment-authorization/records'
import { getScaleInstrumentLocalization } from '../../modules/scale/onboarding/instrument-registry'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { createScaleCatalogRegistry } from '../../modules/scale/library/catalog-registry'
import { getScalePackage } from '../../modules/scale/scale-package.registry'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const AUTH_NOW = '2026-09-06T00:00:00.000Z'

describe('Scale Library catalog version semantics (SL1-C7)', () => {
  it('resolves the instrumentVersion axis through catalog binding', () => {
    const who5 = getScalePackage('who5', '1.0.0')
    const adexi = getScalePackage('adexi_v1', '2.0.0')
    expect(who5).toBeDefined()
    expect(adexi).toBeDefined()

    const registry = createScaleCatalogRegistry([validCatalogManifestBase()])
    expect(registry.getEntry('who5', '1.0.0')?.pkg).toBe(who5)
    expect(registry.getEntry('adexi_v1', '2.0.0')).toBeUndefined()
  })

  it('keeps scoringVersion and reportVersion as independent axes of the definition', () => {
    const who5 = getScalePackage('who5', '1.0.0')!
    expect(who5.definition.scoring.scoringVersion).toBe('1.0.0')
    expect(who5.definition.report.reportVersion).toBe('1.0.0')

    // 值可能暂时相同，但必须是两个互不派生的字段：catalog 只读它们，不写它们。
    expect(who5.definition.scoring).not.toBe(who5.definition.report)
    expect(hashScaleDefinition(who5.definition)).toBe(hashScaleDefinition(who5.definition))
  })

  it('keeps referenceVersion independent from package and scoring versions', () => {
    const referenceSet: AssessmentReferenceSetDefinition = {
      schemaVersion: 1,
      instrumentType: 'scale',
      instrumentKey: 'who5',
      referenceVersion: 'who5-cn-2020-v1',
      status: 'ACTIVE',
      entries: [{
        scoreKey: 'total',
        referenceKind: 'descriptive_sample',
        evidenceLevel: 'literature_beta',
        provenanceType: 'literature_reported',
        instrumentVersion: '1.0.0',
        scoringVersion: '1.0.0',
        population: { description: '中国大陆青少年样本' },
        source: { citation: '示例文献：某中文版描述性样本研究, 2020' },
        statistics: { mean: 15, sd: 5 },
      }],
    }
    const validation = validateReferenceSetDefinition(referenceSet)
    expect(validation.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
    expect(validation.definition?.referenceVersion).toBe('who5-cn-2020-v1')
  })

  it('treats localizationVersion as a reserved axis: catalog V1 has no localization section yet', () => {
    const result = parseScaleCatalogManifest(validCatalogManifestBase())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect('localization' in result.manifest).toBe(false)
    }
    expect(getScaleInstrumentLocalization('texi_parent_zh_cn', '1.0.0')?.localizationVersion).toBe('1.0.0')
  })

  it('allows catalog content changes to bump only catalogManifestVersion', () => {
    const manifestV1 = validCatalogManifestBase()
    const manifestV2 = {
      ...manifestV1,
      catalogManifestVersion: 2,
      construct: {
        ...manifestV1.construct,
        constructOverlapTags: [...manifestV1.construct.constructOverlapTags, 'life_satisfaction'],
      },
    }
    const registryV1 = createScaleCatalogRegistry([manifestV1])
    const registryV2 = createScaleCatalogRegistry([manifestV2])
    const entryV1 = registryV1.getEntry('who5', '1.0.0')
    const entryV2 = registryV2.getEntry('who5', '1.0.0')
    expect(entryV1?.bindingStatus).toBe('BOUND')
    expect(entryV2?.bindingStatus).toBe('BOUND')
    expect(hashScaleDefinition(entryV1!.pkg!.definition)).toBe(hashScaleDefinition(entryV2!.pkg!.definition))
  })

  it('mints InstrumentAuthorization versions append-only (axis 7)', () => {
    const draft = createInstrumentAuthorizationDraft({
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      grantor: 'World Health Organization',
      grantee: 'eduK12',
      scope: {
        electronicAdministration: true,
        scoring: true,
        translation: false,
        display: true,
        territories: ['CN'],
        locales: ['zh-CN'],
        commercialNature: 'NON_COMMERCIAL',
      },
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
      basis: 'CC BY-NC-SA 3.0 IGO non-commercial electronic use',
      createdByUserId: 'admin-1',
      now: AUTH_NOW,
    })
    expect(draft.version).toBe(1)

    const approved = approveInstrumentAuthorization({
      record: draft,
      actorUserId: 'admin-2',
      now: AUTH_NOW,
    }).record
    expect(approved.version).toBe(1)

    const amended = amendApprovedInstrumentAuthorization({
      previous: approved,
      patch: { basis: 'renewed non-commercial electronic use' },
      actorUserId: 'admin-1',
      now: AUTH_NOW,
    }).record
    expect(amended.version).toBe(2)
    expect(amended.status).toBe('DRAFT')
  })
})
