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

const WAVE0_KEYS = [
  'adexi_v1',
  'who5',
  'sdq_parent_zh_cn',
  'sdq_teacher_zh_cn',
  'texi_parent_zh_cn',
  'texi_teacher_zh_cn',
] as const
const WAVE0_KEY_SET = new Set<string>(WAVE0_KEYS)
const wave0Entries = <T extends { identity: { instrumentKey: string } }>(entries: T[]): T[] => (
  entries.filter((entry) => WAVE0_KEY_SET.has(entry.identity.instrumentKey))
)

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
    const entries = wave0Entries(model.entries)
    expect(entries).toHaveLength(6)
    expect(keys(entries)).toEqual([...WAVE0_KEYS])
    expect(entries.every(isScaleLibraryPublicPayloadSafe)).toBe(true)
    expect(entries.every((entry) => entry.governance === undefined)).toBe(true)
    const who5 = entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.source.citation).toContain('World Health Organization')
    expect(who5.localization.targetLocale).toBe('zh-CN')
  })

  it('filters only by declared metadata and actual localization target locale', () => {
    const model = buildScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    const entries = wave0Entries(model.entries)
    expect(keys(filterScaleLibraryEntries(entries, { locale: 'zh-CN' }))).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(entries, { locale: 'en' }))).toEqual([
      'sdq_teacher_zh_cn',
      'texi_parent_zh_cn',
      'texi_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(entries, { instrumentFamily: 'WHO-5 Well-Being Index family' }))).toEqual(['who5'])
    expect(keys(filterScaleLibraryEntries(entries, { respondent: 'PARENT' }))).toEqual([
      'sdq_parent_zh_cn',
      'texi_parent_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(entries, { respondent: 'TEACHER', primaryDomain: 'EXECUTIVE_FUNCTION' }))).toEqual([
      'texi_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(entries, { minAge: 9, maxAge: 12 }))).toEqual([
      'who5',
      'sdq_parent_zh_cn',
      'sdq_teacher_zh_cn',
    ])
    expect(keys(filterScaleLibraryEntries(entries, { minGrade: 3, maxGrade: 6 }))).toContain('who5')
    expect(keys(filterScaleLibraryEntries(entries, { intendedUse: 'INDIVIDUAL_REFLECTION' }))).toHaveLength(6)
  })

  it('uses each entry target locale when the read context does not specify one', () => {
    const defaultModel = buildScaleLibraryReadModel({ territory: 'CN', nowIso: NOW })
    const defaultEntries = wave0Entries(defaultModel.entries)
    const defaultLocales = Object.fromEntries(defaultEntries.map((entry) => [
      entry.identity.instrumentKey,
      entry.availability.locale,
    ]))
    expect(defaultLocales).toEqual({
      adexi_v1: 'zh-CN',
      who5: 'zh-CN',
      sdq_parent_zh_cn: 'zh-CN',
      sdq_teacher_zh_cn: 'en',
      texi_parent_zh_cn: 'en',
      texi_teacher_zh_cn: 'en',
    })
    for (const key of ['sdq_teacher_zh_cn', 'texi_parent_zh_cn', 'texi_teacher_zh_cn']) {
      const entry = defaultEntries.find((candidate) => candidate.identity.instrumentKey === key)!
      expect(entry.availability.reasons).not.toContain('当前内容语言为 en，不提供 zh-CN 版本。')
    }

    const explicitZh = buildScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', nowIso: NOW })
    const explicitZhEntries = wave0Entries(explicitZh.entries)
    expect(keys(filterScaleLibraryEntries(explicitZhEntries, { locale: 'zh-CN' }))).toEqual([
      'adexi_v1',
      'who5',
      'sdq_parent_zh_cn',
    ])
    expect(explicitZh.entries.find((entry) => entry.identity.instrumentKey === 'sdq_teacher_zh_cn')?.availability.reasons)
      .toContain('当前内容语言为 en，不提供 zh-CN 版本。')

    const explicitEn = buildScaleLibraryReadModel({ locale: 'en', territory: 'CN', nowIso: NOW })
    const explicitEnEntries = wave0Entries(explicitEn.entries)
    expect(keys(filterScaleLibraryEntries(explicitEnEntries, { locale: 'en' }))).toEqual([
      'sdq_teacher_zh_cn',
      'texi_parent_zh_cn',
      'texi_teacher_zh_cn',
    ])
    expect(explicitEn.entries.find((entry) => entry.identity.instrumentKey === 'sdq_teacher_zh_cn')?.availability.locale).toBe('en')
    expect(explicitEn.entries.find((entry) => entry.identity.instrumentKey === 'who5')?.availability.reasons)
      .toContain('当前内容语言为 zh-CN，不提供 en 版本。')

    const directEnglish = defaultEntries.find((entry) => entry.identity.instrumentKey === 'sdq_teacher_zh_cn')!
    expect(directEnglish.localization.targetLocale).toBe('en')
    expect(directEnglish.availability.locale).toBe('en')
    expect(directEnglish.availability.reasons).not.toContain('当前内容语言为 en，不提供 zh-CN 版本。')
  })

  it('keeps deployment and authorization gates fail-closed for PUBLISHED packages', () => {
    const model = buildScaleLibraryReadModel({
      locale: 'zh-CN',
      territory: 'CN',
      nowIso: NOW,
      deployments: [{ scaleId: 'scale-who5', code: 'who5', instrumentVersion: '1.0.0', status: 'PUBLISHED' }],
    })
    const who5 = model.entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.availability.status).toBe('RESTRICTED')
    expect(who5.availability.launch).toBeUndefined()
    expect(who5.availability.reasons.join(' ')).toContain('授权未满足')
    expect(who5.availability.reasons.join(' ')).not.toContain('量表包尚未发布')
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
    const entries = wave0Entries(model.entries)
    const who5 = entries.find((entry) => entry.identity.instrumentKey === 'who5')!
    expect(who5.governance?.scientificMaturity).toBe('PILOT')
    expect(who5.governance?.evidence).toHaveLength(1)
    expect(who5.source.citation).toContain('World Health Organization')
    expect(who5.governance?.gate.reportEligibility.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    expect(who5.evidence.recordCount).toBe(1)
    expect(who5.evidence.status).toBe('EVIDENCE_RECORDED')
    expect(who5.evidence.coverageText).toContain('Scientific Evidence Matrix')
    expect(who5.evidence.coverageText).toContain('不作超出样本的验证、常模或诊断声称')

    const sdqParent = entries.find((entry) => entry.identity.instrumentKey === 'sdq_parent_zh_cn')!
    expect(sdqParent.source.citation).toContain('Goodman R.')
    expect(sdqParent.governance?.evidence).toHaveLength(1)
    expect(entries.flatMap((entry) => entry.governance?.evidence ?? [])).toHaveLength(3)
  })
})
