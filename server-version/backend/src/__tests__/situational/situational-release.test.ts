import { beforeEach, describe, expect, it, vi } from 'vitest'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), query: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { sjtAuthorRelease: { findMany: mocks.findMany }, $queryRaw: mocks.query } }))
import { listSituationalResourceSummaries, resolveSituationalRelease, resolveSituationalReleases, situationalReleaseKey } from '../../modules/situational/situational-release.service'
import { resolveCompositeSituationalItems } from '../../modules/composite/composite.service'

const compiled = compileSjtTemplate({ ...example, instrumentKey: 'c11-student-release', respondentType: 'student_self_report' })
const identity = { instrumentKey: compiled.package.key, instrumentVersion: compiled.package.instrumentVersion }
const row = { ...identity, status: 'PUBLISHED', definitionHash: compiled.definitionHash, package: { ...compiled.package, releaseStatus: 'PUBLISHED' } }
beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([row]); mocks.query.mockResolvedValue([{ id: 'release' }]) })
describe('exact SJT release resolution', () => {
  it('batches and deduplicates exact releases, locking before loading and freezing once', async () => {
    const db = { sjtAuthorRelease: { findMany: mocks.findMany }, $queryRaw: mocks.query } as any
    const values = await resolveSituationalReleases(Array(20).fill(identity), db, true)
    expect(values.size).toBe(1)
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.findMany.mock.invocationCallOrder[0])
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ OR: [identity] })
    const frozen = values.get(situationalReleaseKey(identity))!
    expect(frozen.snapshot.definitionHash).toBe(compiled.definitionHash)
    expect(frozen.snapshot.scientificContext?.scientificMaturity).toBe('PILOT')
    expect(frozen.snapshot.scientificContext?.scope.population).toBe('学生试点参与者')
    expect(frozen.snapshot.scoringVersion).toBe('author-key-sum-v1')
    expect(frozen.runtime).toBe(frozen.snapshot.compiledRuntime)
  })
  it.each(['retired', 'missing', 'hash', 'version', 'package-status'])('fails closed for %s', async defect => {
    const bad = structuredClone(row)
    if (defect === 'retired') bad.status = 'RETIRED'
    if (defect === 'hash') bad.definitionHash = '0'.repeat(64)
    if (defect === 'version') bad.package.instrumentVersion = '9.0.0'
    if (defect === 'package-status') bad.package.releaseStatus = 'RETIRED'
    mocks.findMany.mockResolvedValue(defect === 'missing' ? [] : [bad])
    await expect(resolveSituationalReleases([identity])).rejects.toMatchObject({ statusCode: expect.any(Number) })
  })
  it('does not query uploads for builtin-only or empty operations', async () => {
    expect((await resolveSituationalReleases([])).size).toBe(0)
    expect((await resolveSituationalReleases([{ instrumentKey: 'sjt-assertiveness-golden', instrumentVersion: '1.0.0' }])).size).toBe(1)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it('selects standalone latest using headers then only resolves the exact chosen version', async () => {
    mocks.findMany.mockResolvedValueOnce([{ instrumentVersion: '1.0.0' }]).mockResolvedValueOnce([row])
    await resolveSituationalRelease({ instrumentKey: identity.instrumentKey })
    expect(mocks.findMany.mock.calls[0][0].select).toEqual({ instrumentVersion: true })
    expect(mocks.findMany.mock.calls[1][0].where).toEqual({ OR: [identity] })
  })
  it('rejects uploaded teacher self-report from student composite admission', async () => {
    const teacher = compileSjtTemplate({ ...example, instrumentKey: 'c11-teacher-release' })
    mocks.findMany.mockResolvedValue([{ instrumentKey: teacher.package.key, instrumentVersion: teacher.package.instrumentVersion, status: 'PUBLISHED', definitionHash: teacher.definitionHash, package: { ...teacher.package, releaseStatus: 'PUBLISHED' } }])
    await expect(resolveCompositeSituationalItems([{ type: 'SITUATIONAL', situationalInstrumentKey: teacher.package.key, situationalInstrumentVersion: teacher.package.instrumentVersion }])).rejects.toThrow('教师自评')
  })
  it('projects resource headers without answer keys or templates and rejects corrupt metadata', async () => {
    const summary = { ...identity, definitionHash: compiled.definitionHash, name: '学生情境试点', respondentType: 'student_self_report', packageKey: identity.instrumentKey, packageVersion: identity.instrumentVersion, packageStatus: 'PUBLISHED' }
    mocks.query.mockResolvedValue([summary])
    const rows = await listSituationalResourceSummaries()
    expect(rows.find(value => value.instrumentKey === identity.instrumentKey)).toEqual({ id: identity.instrumentKey + '/' + identity.instrumentVersion, name: summary.name, ...identity })
    expect(mocks.findMany).not.toHaveBeenCalled()
    mocks.query.mockResolvedValue([{ ...summary, packageVersion: '9.0.0' }])
    await expect(listSituationalResourceSummaries()).rejects.toThrow('校验失败')
  })
})
