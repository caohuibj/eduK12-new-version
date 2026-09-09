import { describe, expect, it } from 'vitest'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { getScalePackage } from '../../modules/scale/scale-package.registry'
import {
  buildScaleLibraryReadModel,
  filterScaleLibraryEntries,
  isScaleLibraryPublicPayloadSafe,
} from '../../modules/scale/library/scale-library-read-model'

const NOW = '2026-09-07T00:00:00.000Z'

const keys = (entries: Array<{ identity: { instrumentKey: string } }>): string[] => (
  entries.map((entry) => entry.identity.instrumentKey)
)

const approvedAuthorization = (instrumentKey: string, instrumentVersion: string) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey,
    instrumentVersion,
    grantor: 'Wave 0 rights record',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: true,
      translation: true,
      display: true,
      territories: ['CN'],
      locales: ['zh-CN', 'en'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    basis: 'Wave 0 test authorization; no production record is created.',
    createdByUserId: 'wave0-test-admin',
    now: NOW,
  })
  return approveInstrumentAuthorization({
    record: draft,
    actorUserId: 'wave0-test-approver',
    now: NOW,
  }).record
}

describe('Wave 0 Scale Library read model', () => {
  it('binds the six scoped packages without adding a runtime payload', () => {
    const model = buildScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    expect(model.entries).toHaveLength(6)
    expect(keys(model.entries)).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
      'sdq_teacher_zh_cn',
      'texi_parent_zh_cn',
      'texi_teacher_zh_cn',
    ])
    expect(model.entries.every(isScaleLibraryPublicPayloadSafe)).toBe(true)
    expect(model.entries.every((entry) => entry.governance === undefined)).toBe(true)
  })

  it('filters only by declared metadata and actual localization target locale', () => {
    const model = buildScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    expect(keys(filterScaleLibraryEntries(model.entries, { locale: 'zh-CN' }))).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(model.entries, { locale: 'en' }))).toEqual([
      'sdq_teacher_zh_cn',
      'texi_parent_zh_cn',
      'texi_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(model.entries, { respondent: 'PARENT' }))).toEqual([
      'sdq_parent_zh_cn',
      'texi_parent_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(model.entries, { respondent: 'TEACHER', primaryDomain: 'EXECUTIVE_FUNCTION' }))).toEqual([
      'texi_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(model.entries, { minAge: 9, maxAge: 12 }))).toEqual([
      'who5',
      'sdq_parent_zh_cn',
      'sdq_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(model.entries, { minGrade: 3, maxGrade: 6 }))).toContain('who5')
    expect(keys(filterScaleLibraryEntries(model.entries, { intendedUse: 'INDIVIDUAL_REFLECTION' }))).toHaveLength(6)
  })

  it('keeps package, deployment, and authorization gates fail-closed', () => {
    const model = buildScaleLibraryReadModel({
      locale: 'zh-CN',
      territory: 'CN',
      nowIso: NOW,
      deployments: [{ scaleId: 'scale-who5', code: 'who5', instrumentVersion: '1.0.0', status: 'PUBLISHED' }],
    })
    const who5 = model.entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.availability.status).toBe('RESTRICTED')
    expect(who5.availability.launch).toBeUndefined()
    expect(who5.availability.reasons.join(' ')).toContain('量表包尚未发布')
    expect(who5.rights.status).toBe('NOT_GRANTED')

    const missingDeployment = model.entries.find((entry) => entry.identity.instrumentKey === 'adexi_v1')!
    expect(missingDeployment.availability.status).toBe('NOT_AVAILABLE')
    expect(missingDeployment.availability.reasons.join(' ')).toContain('尚无已发布')
  })

  it('launches only after existing package, deployment, locale, and rights gates pass', () => {
    const pkg = getScalePackage('adexi_v1', '2.0.0')!
    const originalReleaseStatus = pkg.releaseStatus
    pkg.releaseStatus = 'PUBLISHED'
    try {
      const model = buildScaleLibraryReadModel({
        locale: 'zh-CN',
        territory: 'CN',
        respondent: 'SELF',
        nowIso: NOW,
        authorizations: [approvedAuthorization('adexi_v1', '2.0.0')],
        deployments: [{ scaleId: 'scale-adexi', code: 'adexi_v1', instrumentVersion: '2.0.0', status: 'PUBLISHED' }],
      })
      const adexi = model.entries.find((entry) => entry.identity.instrumentKey === 'adexi_v1')!
      expect(adexi.availability.status).toBe('AVAILABLE')
      expect(adexi.availability.launch).toEqual({ scaleId: 'scale-adexi', route: '/student/scales/scale-adexi' })
      expect(adexi.rights.status).toBe('EVIDENCE_PENDING')
    } finally {
      pkg.releaseStatus = originalReleaseStatus
    }
  })

  it('keeps scientific maturity and evidence matrix details in the controlled admin projection', () => {
    const model = buildScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', viewerRole: 'ADMIN', nowIso: NOW })
    const who5 = model.entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.governance?.scientificMaturity).toBe('PILOT')
    expect(who5.governance?.evidence[0].rating).toBe('UNKNOWN')
    expect(who5.governance?.gate.reportEligibility.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    expect(who5.evidence.coverageText).toContain('不把来源记录升级')
  })
})
