import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), manager: vi.fn(), readCatalog: vi.fn(), loadEntry: vi.fn(), entryView: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: mocks.query, $transaction: mocks.transaction } }))
vi.mock('../../modules/survey/admin-role', () => ({ assertSurveyLibraryManager: mocks.manager }))
vi.mock('../../modules/scale/library/standard-catalog-reader', () => ({ readStandardScaleLibraryForActor: mocks.readCatalog }))
vi.mock('../../modules/scale-library-governance/service', () => ({ loadEntry: mocks.loadEntry, entryView: mocks.entryView, submissionView: vi.fn(), readSubmission: vi.fn() }))
vi.mock('../../modules/survey/governed-tool.service', () => ({ assertGovernedOnline: vi.fn(), assertGovernedEntryAllowed: vi.fn() }))
vi.mock('../../modules/survey/governed-package.service', () => ({ assertFrozenPackageAdmissions: vi.fn() }))
vi.mock('../../modules/measurement-content/repository', () => ({ getContentRelease: vi.fn(), publishContentRelease: vi.fn() }))
vi.mock('../../modules/survey/final.compute', () => ({ computeSurveyFinal: vi.fn() }))

import { standardTripletCatalog } from '../../modules/survey/standard-triplet.service'
import { surveyLibraryCatalog } from '../../modules/survey/library-admin.service'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { buildUnifiedScaleLibraryReadModel } from '../../modules/scale/library/catalog-only-read-model'
import { standardPolicyIdentity } from '../../modules/survey/tool-policy'

const model = buildUnifiedScaleLibraryReadModel({ viewerRole: 'ADMIN', locale: 'zh-CN', territory: 'CN', nowIso: '2026-10-25T00:00:00.000Z' })
const wave = model.entries.filter(entry => entry.construct.constructOverlapTags.includes('student_self_report'))
const sourceVersionId = (identity: { instrumentKey: string; instrumentVersion: string }) => `${identity.instrumentKey}:${identity.instrumentVersion}`
const studentVersions = listScaleInstrumentSources()
  .filter(source => source.catalog.construct.constructOverlapTags.includes('student_self_report'))
  .map(source => sourceVersionId(source.identity)).sort()
const sqlText = (input: { strings?: readonly string[] } | readonly string[]) => (Array.isArray(input) ? input : (input as { strings: readonly string[] }).strings).join('?')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query }))
  mocks.query.mockImplementation(async input => sqlText(input).includes('FROM users') ? [{ id: 'system' }] : [])
  mocks.manager.mockResolvedValue(undefined)
  mocks.readCatalog.mockResolvedValue(model)
})

describe('server-wide discovery before public-catalog pagination', () => {
  it('keeps the #355 SDQ function fingerprint fix on its actual unfiltered pages after catalog expansion', async () => {
    const sortedSourceIds = listScaleInstrumentSources().map(source => sourceVersionId(source.identity)).sort((a, b) => a.localeCompare(b))
    const sortedModelIds = model.entries.map(entry => sourceVersionId(entry.identity)).sort((a, b) => a.localeCompare(b))
    const sdqId = 'sdq_teacher_zh_cn:1.0.0'
    const standardIndex = sortedSourceIds.indexOf(sdqId)
    const surveyIndex = sortedModelIds.indexOf(sdqId)
    expect(standardIndex).toBeGreaterThanOrEqual(25)
    expect(surveyIndex).toBeGreaterThanOrEqual(25)
    const standard = await standardTripletCatalog('system', Math.floor(standardIndex / 25) + 1)
    const survey = await surveyLibraryCatalog('manager', Math.floor(surveyIndex / 25) + 1)
    expect(standard.list.length).toBeGreaterThan(0)
    expect(survey.list.length).toBeGreaterThan(0)
    expect(standard.list.some(row => row.toolKey === 'sdq_teacher_zh_cn' && row.instrumentVersion === '1.0.0')).toBe(true)
    const sdq = survey.list.find(row => row.exactVersion.origin === 'STANDARD_REGISTRY' && sourceVersionId(row.exactVersion) === sdqId)
    expect(sdq?.policyIdentity).toEqual(standardPolicyIdentity('sdq_teacher_zh_cn', '1.0.0'))
    expect(survey.list.every(row => Array.isArray(row.classificationTags))).toBe(true)
  })
  it('finds a standard version outside the original first page with an old tag ID and Chinese aliases', async () => {
    const all = listScaleInstrumentSources().slice().sort((a, b) => `${a.identity.instrumentKey}:${a.identity.instrumentVersion}`.localeCompare(`${b.identity.instrumentKey}:${b.identity.instrumentVersion}`))
    const index = all.findIndex(source => source.identity.instrumentKey === 'value_cost_mathematics_zh_cn')
    expect(index).toBeGreaterThanOrEqual(25)
    const result = await standardTripletCatalog('system', 1, { keyword: '学生 数学', tags: ['value_cost'] })
    expect(result.list.map(row => row.toolKey)).toEqual(['value_cost_mathematics_zh_cn'])
    expect(result.hasMore).toBe(false)
    expect(result.list[0].tags).toContain('student_self_report')
    expect(result.list[0].classificationTags).toContainEqual({ id: 'student_self_report', label: '学生', facet: 'population' })
    expect(result.tagFacets.subject).toHaveLength(6)
  })
  it('paginates every source-declared student standard version without duplicates or missing versions', async () => {
    expect(studentVersions.length).toBeGreaterThan(25)
    const identities: string[] = []
    let facets: unknown
    for (let page = 1; page <= Math.ceil(studentVersions.length / 25) + 1; page++) {
      const result = await standardTripletCatalog('system', page, { tags: ['student_self_report'] })
      expect(result.list).toHaveLength(Math.max(0, Math.min(25, studentVersions.length - (page - 1) * 25)))
      expect(result.hasMore).toBe(page * 25 < studentVersions.length)
      if (page === 1) facets = result.tagFacets
      expect(result.tagFacets).toEqual(facets)
      identities.push(...result.list.map(row => `${row.toolKey}:${row.instrumentVersion}`))
    }
    expect(identities.slice().sort()).toEqual(studentVersions)
    expect(new Set(identities).size).toBe(studentVersions.length)
  })
  it('still refuses standard discovery before registry results when administrator authority fails', async () => {
    mocks.query.mockResolvedValue([])
    await expect(standardTripletCatalog('not-system', 1, { keyword: '学生' })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
  it('filters Survey standard entries across pages and preserves their current approval/availability', async () => {
    const result = await surveyLibraryCatalog('manager', 1, { keyword: '学生 数学', tags: ['value_cost'], origin: 'STANDARD_REGISTRY' })
    expect(result.list).toHaveLength(1)
    const row = result.list[0]
    expect(row.exactVersion).toMatchObject({ instrumentKey: 'value_cost_mathematics_zh_cn' })
    expect(row.policy).toMatchObject({ decision: 'PENDING', version: 0 })
    expect(row.states.assignment.ready).toBe(false)
    expect(row.states.deployment.ready).toBe(false)
    expect(result.hasMore).toBe(false)
    expect(mocks.manager).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls.some(([query]) => sqlText(query).includes('scale_library_entries'))).toBe(false)
  })
  it('returns every source-declared student Survey match without filling pages with untagged authored tools', async () => {
    mocks.readCatalog.mockResolvedValue({ ...model, entries: wave })
    expect(studentVersions.length).toBeGreaterThan(25)
    const identities: string[] = []
    let facets: unknown
    for (let page = 1; page <= Math.ceil(studentVersions.length / 25) + 1; page++) {
      const result = await surveyLibraryCatalog('manager', page, { tags: ['student_self_report'] })
      expect(result.list).toHaveLength(Math.max(0, Math.min(25, studentVersions.length - (page - 1) * 25)))
      expect(result.hasMore).toBe(page * 25 < studentVersions.length)
      if (page === 1) facets = result.tagFacets
      expect(result.tagFacets).toEqual(facets)
      for (const row of result.list) {
        expect(row.origin).toBe('STANDARD_REGISTRY')
        expect(row.classificationTags).toContainEqual({ id: 'student_self_report', label: '学生', facet: 'population' })
        if (row.exactVersion.origin === 'STANDARD_REGISTRY') identities.push(sourceVersionId(row.exactVersion))
      }
    }
    expect(identities.slice().sort()).toEqual(studentVersions)
    expect(new Set(identities).size).toBe(studentVersions.length)
    expect(mocks.query.mock.calls.some(([query]) => sqlText(query).includes('scale_library_entries'))).toBe(false)
  })
  it('reports an authored continuation even when standard matches fill exactly the last 25-row page', async () => {
    mocks.readCatalog.mockResolvedValue({ ...model, entries: wave.slice(0, 25) })
    mocks.query.mockImplementation(async input => sqlText(input).includes('SELECT e.id FROM scale_library_entries') ? [{ id: 'next-authored' }] : [])
    const result = await surveyLibraryCatalog('manager', 1)
    expect(result.list).toHaveLength(25)
    expect(result.hasMore).toBe(true)
    expect(mocks.loadEntry).not.toHaveBeenCalled()
    const [query] = mocks.query.mock.calls.find(([query]) => sqlText(query).includes('SELECT e.id FROM scale_library_entries'))!
    expect(query.values.slice(-2)).toEqual([1, 0])
  })
  it('applies authored keyword terms safely in SQL before LIMIT and honors source-only pages', async () => {
    const result = await surveyLibraryCatalog('manager', 2, { keyword: "math% '_", origin: 'AUTHORED' })
    expect(result.list).toEqual([])
    const [query] = mocks.query.mock.calls.find(([query]) => sqlText(query).includes('SELECT e.id FROM scale_library_entries'))!
    expect(sqlText(query).indexOf('strpos')).toBeLessThan(sqlText(query).indexOf('LIMIT'))
    expect(query.values).toEqual(['math%', "'_", 26, 25])
    expect(sqlText(query)).not.toContain('math%')
    expect(mocks.loadEntry).not.toHaveBeenCalled()
  })
  it('does not silently ignore unsupported tags on authored entries or broaden unknown tags', async () => {
    for (const filters of [{ origin: 'AUTHORED' as const, tags: ['student_self_report'] }, { tags: ['not_a_tag'] }]) {
      expect((await surveyLibraryCatalog('manager', 1, filters)).list).toEqual([])
    }
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('refuses Survey discovery when existing management authority is absent', async () => {
    mocks.manager.mockRejectedValueOnce(Object.assign(new Error('denied'), { statusCode: 403 }))
    await expect(surveyLibraryCatalog('not-manager', 1, { tags: ['student_self_report'] })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.readCatalog).not.toHaveBeenCalled()
  })
})
