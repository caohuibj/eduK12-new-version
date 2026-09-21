import { describe, expect, it } from 'vitest'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { createScaleCatalogRegistry } from '../../modules/scale/library/catalog-registry'
import {
  isScaleLibraryPublicPayloadSafe,
  type ScaleLibraryEntry,
} from '../../modules/scale/library/scale-library-read-model'
import {
  buildUnifiedScaleLibraryReadModel as buildExpandedScaleLibraryReadModel,
  filterUnifiedScaleLibraryEntries as filterExpandedScaleLibraryEntries,
} from '../../modules/scale/library/catalog-only-read-model'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { materializeCatalogManifest } from '../../modules/scale/onboarding/validate-instrument'
const WAVE1_P1_SCALE_CATALOG_MANIFESTS = listScaleInstrumentSources().filter(source => !source.executable).map(materializeCatalogManifest)

const NOW = '2026-09-20T00:00:00.000Z'

const keys = (entries: Array<{ identity: { instrumentKey: string } }>): string[] => entries.map((entry) => entry.identity.instrumentKey)

const approvedAuthorization = (instrumentKey: string, instrumentVersion: string) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey,
    instrumentVersion,
    grantor: 'Wave 1 P1 test rights record',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: true,
      translation: true,
      display: true,
      territories: ['CN'],
      locales: ['zh-CN'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    basis: 'Test-only authorization; does not create production rights.',
    createdByUserId: 'wave1-test-admin',
    now: NOW,
  })
  return approveInstrumentAuthorization({
    record: draft,
    actorUserId: 'wave1-test-approver',
    now: NOW,
  }).record
}

describe('Wave 1 P1 scale-library integration', () => {
  it('accepts REVIEWED catalog-first entries as warnings while keeping ACCEPTED package binding fail-closed', () => {
    const registry = createScaleCatalogRegistry(WAVE1_P1_SCALE_CATALOG_MANIFESTS)
    expect(registry.valid).toBe(true)
    expect(registry.entries).toHaveLength(4)
    expect(registry.entries.every((entry) => entry.bindingStatus === 'PACKAGE_MISSING')).toBe(true)
    const missingDiagnostics = registry.diagnostics.filter((diagnostic) => diagnostic.code === 'CATALOG_PACKAGE_MISSING')
    expect(missingDiagnostics).toHaveLength(4)
    expect(missingDiagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true)
  })

  it('keeps the six Wave 0 executable entries and adds four catalog-first P1 entries', () => {
    const model = buildExpandedScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    expect(model.entries).toHaveLength(10)
    expect(keys(model.entries)).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
      'sdq_teacher_zh_cn',
      'texi_parent_zh_cn',
      'texi_teacher_zh_cn',
      'dass21_zh_cn',
      'gse_zh_cn',
      'mpfi24_zh_cn',
      'pss10_zh_cn',
    ])

    const wave1 = model.entries.slice(6)
    expect(wave1.every((entry) => entry.availability.status === 'NOT_AVAILABLE')).toBe(true)
    expect(wave1.every((entry) => entry.availability.launch === undefined)).toBe(true)
    expect(wave1.every((entry) => isScaleLibraryPublicPayloadSafe(entry as unknown as ScaleLibraryEntry))).toBe(true)
  })

  it('records DASS-21 as the standard 14+ line and keeps DASS-Y separate', () => {
    const model = buildExpandedScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', viewerRole: 'ADMIN', nowIso: NOW })
    const dass = model.entries.find((entry) => entry.identity.instrumentKey === 'dass21_zh_cn')!

    expect(dass.identity.canonicalName).toContain('(14+)')
    expect(dass.applicability.minAge).toBe(14)
    expect(dass.applicability.maxAge).toBe(100)
    expect(dass.applicability.gradeRange).toBeUndefined()
    expect(dass.applicability.populationNotes).toContain('DASS-Y')
    expect(dass.applicability.populationNotes).toContain('14 岁以下')
    expect(dass.evidence.recordCount).toBe(3)
    expect(dass.governance?.evidence.map((record) => record.evidenceId)).toEqual([
      'dass21-cn-gong-2010',
      'dass21-cn-wen-2012',
      'dass21-cn-wang-2016',
    ])
  })

  it('exposes Simplified-Chinese validation populations without claiming norms or diagnosis', () => {
    const model = buildExpandedScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', viewerRole: 'ADMIN', nowIso: NOW })

    const dass = model.entries.find((entry) => entry.identity.instrumentKey === 'dass21_zh_cn')!
    expect(dass.applicability.populationNotes).toContain('大学生和成人')
    expect(dass.evidence.recordCount).toBe(3)
    expect(dass.report.dimensionLabels).toEqual(['抑郁相关体验', '焦虑相关体验', '压力/紧张相关体验'])
    expect(dass.report.maxEligibleLevel).toBeNull()
    expect(dass.governance?.packageReleaseStatus).toBe('NOT_BUILT')
    expect(dass.governance?.gate.publishable).toBe(false)

    const gse = model.entries.find((entry) => entry.identity.instrumentKey === 'gse_zh_cn')!
    expect(gse.applicability.populationNotes).toContain('9,578')
    expect(gse.evidence.recordCount).toBe(2)

    const mpfi = model.entries.find((entry) => entry.identity.instrumentKey === 'mpfi24_zh_cn')!
    expect(mpfi.applicability.populationNotes).toContain('3,568')
    expect(mpfi.report.dimensionLabels).toEqual(['心理灵活性', '心理不灵活性'])

    const pss = model.entries.find((entry) => entry.identity.instrumentKey === 'pss10_zh_cn')!
    expect(pss.applicability.populationNotes).toContain('1,096')
    expect(pss.report.limitations.join(' ')).toContain('cut-off')
  })

  it('encodes respondent-safe DASS feedback as descriptive and non-numeric', () => {
    const model = buildExpandedScaleLibraryReadModel({
      locale: 'zh-CN',
      territory: 'CN',
      viewerRole: 'ADMIN',
      nowIso: NOW,
    })
    const dass = model.entries.find((entry) => entry.identity.instrumentKey === 'dass21_zh_cn')!

    expect(dass.report.limitations.join(' ')).toContain('不显示数值分数')
    expect(dass.report.limitations.join(' ')).toContain('不依赖隐藏分数')
    expect(dass.report.limitations.join(' ')).toContain('14 岁及以上')
    expect(dass.report.disclaimer).toContain('非分数化')
    expect(dass.report.disclaimer).toContain('非诊断性')
    expect(dass.availability.reasons.join(' ')).toContain('RESPONDENT_SAFE_PROJECTION_REQUIRED')
    expect(dass.availability.reasons.join(' ')).toContain('AGE_14_RUNTIME_ADMISSION_REQUIRED')
    expect(dass.governance?.gate.errors.join(' ')).toContain('AGE_14_RUNTIME_ADMISSION_REQUIRED')
    expect(dass.governance?.gate.publishable).toBe(false)
  })

  it('never turns a catalog-first entry launchable merely because an authorization record exists', () => {
    const model = buildExpandedScaleLibraryReadModel({
      locale: 'zh-CN',
      territory: 'CN',
      respondent: 'SELF',
      viewerRole: 'ADMIN',
      nowIso: NOW,
      authorizations: [approvedAuthorization('gse_zh_cn', '1.0.0')],
    })
    const gse = model.entries.find((entry) => entry.identity.instrumentKey === 'gse_zh_cn')!
    expect(gse.rights.status).toBe('EVIDENCE_PENDING')
    expect(gse.availability.status).toBe('NOT_AVAILABLE')
    expect(gse.availability.launch).toBeUndefined()
    expect(gse.availability.reasons.join(' ')).toContain('EXECUTABLE_NOT_REGISTERED')
  })

  it('filters Wave 1 entries with the existing library filter semantics', () => {
    const model = buildExpandedScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    expect(keys(filterExpandedScaleLibraryEntries(model.entries, { locale: 'zh-CN' }))).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
      'dass21_zh_cn',
      'gse_zh_cn',
      'mpfi24_zh_cn',
      'pss10_zh_cn',
    ])
    expect(keys(filterExpandedScaleLibraryEntries(model.entries, { primaryDomain: 'SELF_EFFICACY' }))).toEqual(['gse_zh_cn'])
    expect(keys(filterExpandedScaleLibraryEntries(model.entries, { availability: 'NOT_AVAILABLE', respondent: 'SELF' }))).toContain('dass21_zh_cn')
    expect(keys(filterExpandedScaleLibraryEntries(model.entries, { minAge: 8, maxAge: 13 }))).not.toContain('dass21_zh_cn')
    expect(keys(filterExpandedScaleLibraryEntries(model.entries, { minAge: 14, maxAge: 17 }))).toContain('dass21_zh_cn')
  })

  it('adds Chinese validation evidence to existing WHO-5 and SDQ entries without activating references', () => {
    const model = buildExpandedScaleLibraryReadModel({
      locale: 'zh-CN',
      territory: 'CN',
      viewerRole: 'ADMIN',
      nowIso: NOW,
    })

    const who5 = model.entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.evidence.recordCount).toBe(1)
    expect(who5.evidence.coverageText).toContain('大学生')
    expect(who5.evidence.coverageText).toContain('不直接验证当前产品 9–18 岁 K-12 入口')
    expect(who5.references.policy).toBe('none')
    expect(who5.governance?.evidence.some((record) => record.evidenceId === 'who5-cn-fung-2022')).toBe(true)

    const sdqParent = model.entries.find((entry) => entry.identity.instrumentKey === 'sdq_parent_zh_cn')!
    expect(sdqParent.evidence.recordCount).toBe(1)
    expect(sdqParent.evidence.coverageText).toContain('3–17 岁')
    expect(sdqParent.references.policy).toBe('none')

    const sdqTeacher = model.entries.find((entry) => entry.identity.instrumentKey === 'sdq_teacher_zh_cn')!
    expect(sdqTeacher.evidence.coverageText).toContain('当前英文 Teacher runtime 的中文 exact-form 声称')
  })
})
