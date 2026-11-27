import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(), expanded: vi.fn(), authorize: vi.fn(), freeze: vi.fn(), transaction: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    surveyWave: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    surveyPublication: { findFirst: vi.fn() }, surveyProject: { update: vi.fn() },
    surveyEntryToken: { create: vi.fn(), updateMany: vi.fn() }, surveyEvent: { create: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('../../modules/survey/publication.service', () => ({ freezeResearchWaveDraft: mocks.freeze }))
vi.mock('../../modules/survey/waves.service', () => ({
  MAX_WAVE_FINISH_GRACE_MS: 2 * 3600000,
  SurveyWaveError: class extends Error {
    constructor(readonly statusCode: number, message: string) { super(message) }
  },
}))
vi.mock('../../modules/tool-licensing/runtime', () => ({
  isToolLicensingEnabled: mocks.enabled, isExpandedToolLicensingEnabled: mocks.expanded, authorizeToolPublication: mocks.authorize,
  ToolLicenseAccessError: class extends Error { readonly statusCode = 409 },
}))
import { ToolLicenseAccessError } from '../../modules/tool-licensing/runtime'
import { authorizeSurveyStandardPublication } from '../../modules/survey/tool-licensing'
import { openWave, prepareWave, transitionWave } from '../../modules/survey/waves.publish'

const standard = (id: string, code?: string) => ({
  kind: 'SCALE' as const,
  sourceProvenance: {
    surveyStandardReleaseId: id,
    source: { kind: 'SCALE', sourceId: 'survey-standard:' + id, sourceVersion: 'exact-' + id },
    ...(code === undefined ? {} : { code }),
  },
})
const governed = (id: string, kind: 'FORM' | 'SCALE' | 'COGNITIVE' | 'SJT', hash = 'a'.repeat(64)) => ({
  kind,
  sourceProvenance: {
    surveyToolReleaseId: id,
    source: { kind, sourceId: 'survey-tool:' + id, sourceVersion: hash },
  },
})
const cognitiveProfile = (testType: string, selected = 'research', hash = 'b'.repeat(64)) => ({
  kind: 'COGNITIVE' as const,
  sourceProvenance: {
    source: { kind: 'COGNITIVE', sourceId: 'cognitive-profile:config:' + selected, sourceVersion: hash },
    cognitiveProfile: { artifactHash: hash, configuration: { kind: 'COGNITIVE_PROFILE', configId: 'config', profile: selected, testType } },
  },
})
const libraryScale = (entryId: string, releaseId: string, contentHash = 'e'.repeat(64)) => ({
  kind: 'SCALE' as const,
  sourceProvenance: {
    libraryEntryId: entryId,
    source: { kind: 'SCALE', sourceId: 'library:' + entryId, sourceVersion: 'exact-version' },
    sourceMeasurementRelease: { releaseId, contentHash },
  },
})
const now = new Date('2026-11-27T02:00:00.000Z')
const makeWave = () => ({
  id: 'wave', projectId: 'project', status: 'DRAFT', revision: 3, publicationId: 'publication',
  groupIpPolicy: null, groupIpActivatedAt: null, opensAt: null,
  closesAt: null as Date | null, finishUntil: null, hardStopAt: null,
})
let wave = makeWave()
const input = (units: Parameters<typeof authorizeSurveyStandardPublication>[1]['units']) => ({
  subjectId: 'owner', publicationId: 'publication', units,
})
const tx = () => mocks.tx as unknown as Parameters<typeof authorizeSurveyStandardPublication>[0]

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
  mocks.enabled.mockReturnValue(true); mocks.expanded.mockReturnValue(false); mocks.authorize.mockResolvedValue(undefined)
  wave = makeWave()
  const compiledSnapshot = {
    schemaVersion: 1, purpose: 'RESEARCH_ONLY', runtimeStatus: 'SURVEY_FINAL_V1',
    projectId: 'project', waveId: 'wave', units: [standard('release-v2', 'stable-code')],
  }
  mocks.tx.surveyPublication.findFirst.mockResolvedValue({
    id: 'publication', compiledSnapshot, definitionDigest: canonicalHash(compiledSnapshot),
  })
  mocks.transaction.mockImplementation((fn: (db: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx))
  mocks.tx.$queryRaw.mockResolvedValue([{ id: 'project', status: 'ACTIVE', publicId: 'public-id' }])
  mocks.tx.surveyWave.findUniqueOrThrow.mockImplementation(async () => wave)
  mocks.tx.surveyWave.updateMany.mockResolvedValue({ count: 1 })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Survey standard license key adapter', () => {
  it('returns before reading frozen metadata or querying while disabled', async () => {
    mocks.enabled.mockReturnValue(false)
    const units = [{ kind: 'SCALE' as const, get sourceProvenance(): never { throw new Error('not read') } }]
    await authorizeSurveyStandardPublication(tx(), input(units))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('leaves private scales, unrelated families and legacy nonstandard sources untouched', async () => {
    await authorizeSurveyStandardPublication(tx(), input([
      { kind: 'SCALE' }, { kind: 'SCALE', sourceProvenance: { code: 'private-code' } },
      { kind: 'SCALE', sourceProvenance: { source: { kind: 'SCALE', sourceId: 'legacy-scale' } } },
      { ...standard('form', 'form-code'), kind: 'FORM' },
      { ...standard('sjt', 'sjt-code'), kind: 'SJT' },
      { ...standard('cognitive', 'cognitive-code'), kind: 'COGNITIVE' },
    ]))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('uses the frozen stable code once across exact v1/v2 combinations without lookup', async () => {
    await authorizeSurveyStandardPublication(tx(), input([
      standard('release-v1', 'stable-code'), standard('release-v2', 'stable-code'),
    ]))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      product: 'SURVEY', subjectId: 'owner', publicationId: 'publication', toolKeys: ['SCALE:stable-code'],
    })
  })
  it('batch resolves older exact standard snapshots without changing version identity', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([
      { id: 'release-v1', tool_key: 'stable-code' }, { id: 'release-v2', tool_key: 'stable-code' },
      { id: 'release-other', tool_key: 'another-code' },
    ])
    await authorizeSurveyStandardPublication(tx(), input([
      standard('release-v1'), standard('release-v2'), standard('release-other'), standard('release-v1'),
    ]))
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    const sql = mocks.tx.$queryRaw.mock.calls[0][0]
    expect(sql.sql).toContain('FROM survey_standard_releases')
    expect(sql.values).toEqual(['release-other', 'release-v1', 'release-v2'])
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      toolKeys: ['SCALE:another-code', 'SCALE:stable-code'],
    }))
  })
  it('rejects a recognized missing or inconsistent source instead of skipping its license', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([])
    await expect(authorizeSurveyStandardPublication(tx(), input([standard('missing')]))).rejects.toMatchObject({ statusCode: 409 })
    const inconsistent = standard('release', 'code')
    inconsistent.sourceProvenance.source.sourceId = 'survey-standard:another'
    await expect(authorizeSurveyStandardPublication(tx(), input([inconsistent]))).rejects.toThrow('冻结标准量表来源不一致')
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('adapts a commercial denial to the Survey error contract and preserves unexpected errors', async () => {
    mocks.authorize.mockRejectedValueOnce(new ToolLicenseAccessError('license denied'))
    await expect(authorizeSurveyStandardPublication(tx(), input([standard('release', 'code')]))).rejects.toMatchObject({ statusCode: 409, message: 'license denied' })
    const unexpected = new Error('unexpected')
    mocks.authorize.mockRejectedValueOnce(unexpected)
    await expect(authorizeSurveyStandardPublication(tx(), input([standard('release', 'code')]))).rejects.toBe(unexpected)
  })
})

describe('Survey first formal OPEN licensing boundary (mocked transaction)', () => {
  it('authorizes the persistent publication inside the opening transaction before any mutation', async () => {
    await openWave('owner', 'project', 'wave', 3)
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      product: 'SURVEY', subjectId: 'owner', publicationId: 'publication', toolKeys: ['SCALE:stable-code'],
    })
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.surveyEntryToken.create.mock.invocationCallOrder[0])
    expect(mocks.tx.surveyWave.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wave', projectId: 'project', status: 'DRAFT', revision: 3 },
      data: expect.objectContaining({ status: 'OPEN' }),
    }))
  })
  it('keeps the disabled OPEN path at its original two lock queries without license access', async () => {
    mocks.enabled.mockReturnValue(false)
    await openWave('owner', 'project', 'wave', 3)
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2)
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.tx.surveyWave.updateMany).toHaveBeenCalledOnce()
  })
  it('does not issue a recruitment token or OPEN after commercial denial', async () => {
    mocks.authorize.mockRejectedValueOnce(new ToolLicenseAccessError('quota exhausted'))
    await expect(openWave('owner', 'project', 'wave', 3)).rejects.toMatchObject({ statusCode: 409, message: 'quota exhausted' })
    expect(mocks.tx.surveyEntryToken.create).not.toHaveBeenCalled()
    expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.surveyEvent.create).not.toHaveBeenCalled()
  })
  it('never checks or consumes on preparation, PAUSE or RESUME of a previously opened publication', async () => {
    await prepareWave('owner', 'project', 'wave', 3)
    expect(mocks.freeze).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'owner' }))
    wave.status = 'OPEN'
    await transitionWave('owner', 'project', 'wave', 3, 'PAUSE')
    wave.status = 'PAUSED'
    await transitionWave('owner', 'project', 'wave', 3, 'RESUME')
    expect(mocks.enabled).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('rejects repeated OPEN or an invalid window before any commercial lookup', async () => {
    wave.status = 'OPEN'
    await expect(openWave('owner', 'project', 'wave', 3)).rejects.toThrow('波次没有冻结的研究内容')
    wave.status = 'DRAFT'; wave.closesAt = now
    await expect(openWave('owner', 'project', 'wave', 3)).rejects.toThrow('波次采集时间窗无效')
    expect(mocks.enabled).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('propagates a failed OPEN compare-and-swap through the same transaction as its charge', async () => {
    mocks.tx.surveyWave.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(openWave('owner', 'project', 'wave', 3)).rejects.toThrow('波次开放发生并发冲突')
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ publicationId: 'publication' }))
    expect(mocks.tx.surveyEvent.create).not.toHaveBeenCalled()
    // This contract asserts a rejected transaction; real counter rollback is a
    // responsibility of the shared runtime's PostgreSQL integration coverage.
  })
})

describe('expanded Survey public-source publication licensing', () => {
  beforeEach(() => { mocks.expanded.mockReturnValue(true) })

  it.each(['FORM', 'SCALE', 'COGNITIVE', 'SJT'] as const)('maps a governed %s exact version to its directory family key', async family => {
    const key = family === 'FORM' || family === 'SJT' ? family + ':original:example' : 'example'
    mocks.tx.$queryRaw.mockResolvedValue([{ id: 'governed', family, tool_key: key, snapshot_hash: 'a'.repeat(64) }])
    await authorizeSurveyStandardPublication(tx(), input([governed('governed', family)]))
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      product: 'SURVEY', subjectId: 'owner', publicationId: 'publication', toolKeys: [key.startsWith(family + ':') ? key : family + ':' + key],
    })
  })

  it('batch resolves governed versions and deduplicates their stable identity without charging underlying provenance', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([
      { id: 'v1', family: 'SCALE', tool_key: 'SCALE:public-scale', snapshot_hash: 'a'.repeat(64) },
      { id: 'v2', family: 'SCALE', tool_key: 'SCALE:public-scale', snapshot_hash: 'c'.repeat(64) },
    ])
    await authorizeSurveyStandardPublication(tx(), input([
      { ...governed('v1', 'SCALE'), sourceProvenance: { ...standard('underlying', 'underlying-key').sourceProvenance, ...governed('v1', 'SCALE').sourceProvenance } },
      governed('v2', 'SCALE', 'c'.repeat(64)),
    ]))
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.calls[0][0].values).toEqual(['v1', 'v2'])
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ toolKeys: ['SCALE:public-scale'] }))
  })

  it.each(['COMBINATION', 'BUNDLE'] as const)('charges only the governed %s parent while its fixed components keep their original source identities', async family => {
    const hash = 'd'.repeat(64)
    mocks.tx.$queryRaw.mockResolvedValue([{ id: 'parent', family, tool_key: 'public-package', snapshot_hash: hash }])
    const member = { ...standard('child-standard', 'child-key'), sourceProvenance: {
      ...standard('child-standard', 'child-key').sourceProvenance,
      surveyPackage: { importId: 'import', toolId: 'parent', hash },
    } }
    await authorizeSurveyStandardPublication(tx(), { ...input([member, standard('separate-standard', 'child-key')]),
      governedPackages: [{ importId: 'import', toolId: 'parent', hash, family }],
    })
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      toolKeys: [family + ':public-package', 'SCALE:child-key'],
    }))
  })

  it('maps directory-supported exact cognitive profiles across configurations without a source query', async () => {
    await authorizeSurveyStandardPublication(tx(), input([
      cognitiveProfile('reaction', 'experience'), cognitiveProfile('reaction', 'research', 'c'.repeat(64)), cognitiveProfile('gonogo'),
    ]))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ toolKeys: ['COGNITIVE:gonogo', 'COGNITIVE:reaction'] }))
  })

  it('leaves private forms/scales, raw legacy cognitive/SJT and not-yet-listed span profiles compatible', async () => {
    await authorizeSurveyStandardPublication(tx(), input([
      { kind: 'FORM' }, { kind: 'SCALE' },
      { kind: 'FORM', sourceProvenance: { source: { kind: 'FORM', sourceId: 'questionnaire:private' } } },
      { kind: 'COGNITIVE', sourceProvenance: { source: { kind: 'COGNITIVE', sourceId: 'raw-config' }, cognitiveProfile: { testType: 'reaction' } } },
      { kind: 'SJT', sourceProvenance: { source: { kind: 'SJT', sourceId: 'registry:scenario' } } },
      cognitiveProfile('digitbackward'), cognitiveProfile('corsi'),
    ]))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('licenses the public members of an ordinary private composition without inventing a local parent key', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([{ id: 'form', family: 'FORM', tool_key: 'FORM:original:public-form', snapshot_hash: 'a'.repeat(64) }])
    await authorizeSurveyStandardPublication(tx(), input([governed('form', 'FORM'), { kind: 'FORM' }, standard('standard', 'stable-code')]))
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      toolKeys: ['FORM:original:public-form', 'SCALE:stable-code'],
    }))
  })

  it.each(['missing', 'hash', 'family'])('rejects a recognized governed identity with %s metadata instead of skipping it', async failure => {
    mocks.tx.$queryRaw.mockResolvedValue(failure === 'missing' ? [] : [{
      id: 'form', family: failure === 'family' ? 'SJT' : 'FORM', tool_key: 'original:public-form',
      snapshot_hash: failure === 'hash' ? 'f'.repeat(64) : 'a'.repeat(64),
    }])
    await expect(authorizeSurveyStandardPublication(tx(), input([governed('form', 'FORM')]))).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('rejects contradictory exact references, package bindings and profile identities before any license charge', async () => {
    const form = governed('form', 'FORM')
    form.sourceProvenance.source.sourceId = 'survey-tool:another'
    await expect(authorizeSurveyStandardPublication(tx(), input([form]))).rejects.toThrow('冻结治理工具来源不一致')
    await expect(authorizeSurveyStandardPublication(tx(), input([{ kind: 'FORM', sourceProvenance: { surveyPackage: { importId: 'missing' } } }]))).rejects.toThrow('冻结整包成员缺少一致的父组合')
    await expect(authorizeSurveyStandardPublication(tx(), { ...input([{ kind: 'FORM' }]),
      governedPackages: [{ importId: 'import', toolId: 'parent', family: 'BUNDLE', hash: 'd'.repeat(64) }],
    })).rejects.toThrow('冻结整包缺少投放成员')
    const profile = cognitiveProfile('reaction')
    profile.sourceProvenance.cognitiveProfile.configuration.configId = 'another'
    await expect(authorizeSurveyStandardPublication(tx(), input([profile]))).rejects.toThrow('冻结认知配置来源不一致')
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('keeps the old standard-only flag from resolving or charging any newly supported tier', async () => {
    mocks.expanded.mockReturnValue(false)
    await authorizeSurveyStandardPublication(tx(), { ...input([governed('form', 'FORM'), governed('sjt', 'SJT'), cognitiveProfile('reaction'), standard('standard', 'stable-code')]),
      governedPackages: [{ importId: 'import', toolId: 'parent', family: 'BUNDLE', hash: 'd'.repeat(64) }],
    })
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ toolKeys: ['SCALE:stable-code'] }))
  })

  it('receives frozen parent metadata through the actual OPEN insertion and keeps commercial denial before all writes', async () => {
    const hash = 'd'.repeat(64), member = { kind: 'FORM', sourceProvenance: { surveyPackage: { importId: 'import', toolId: 'parent', hash } } }
    const compiledSnapshot = { schemaVersion: 1, purpose: 'RESEARCH_ONLY', runtimeStatus: 'SURVEY_FINAL_V1',
      projectId: 'project', waveId: 'wave', units: [member],
      governedPackages: [{ importId: 'import', toolId: 'parent', family: 'BUNDLE', hash }],
    }
    mocks.tx.surveyPublication.findFirst.mockResolvedValue({ id: 'publication', compiledSnapshot, definitionDigest: canonicalHash(compiledSnapshot) })
    mocks.tx.$queryRaw.mockImplementation(async query => query.sql?.includes('survey_governed_tools')
      ? [{ id: 'parent', family: 'BUNDLE', tool_key: 'package', snapshot_hash: hash }]
      : [{ id: 'project', status: 'ACTIVE', publicId: 'public-id' }])
    mocks.authorize.mockRejectedValueOnce(new ToolLicenseAccessError('bundle quota exhausted'))
    await expect(openWave('owner', 'project', 'wave', 3)).rejects.toMatchObject({ statusCode: 409, message: 'bundle quota exhausted' })
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      product: 'SURVEY', subjectId: 'owner', publicationId: 'publication', toolKeys: ['BUNDLE:package'],
    })
    expect(mocks.tx.surveyEntryToken.create).not.toHaveBeenCalled()
    expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
  })
})

describe('expanded Survey approved shared-library scale publication', () => {
  beforeEach(() => { mocks.expanded.mockReturnValue(true) })

  it('resolves prepared exact entries together and uses the directory content key across versions, not entry/release/local IDs', async () => {
    mocks.tx.$queryRaw.mockResolvedValue([
      { id: 'entry-v1', release_id: 'release-v1', content_hash: 'e'.repeat(64), content_key: 'SCALE:authoring:stable-family' },
      { id: 'entry-v2', release_id: 'release-v2', content_hash: 'f'.repeat(64), content_key: 'SCALE:authoring:stable-family' },
    ])
    await authorizeSurveyStandardPublication(tx(), input([
      libraryScale('entry-v1', 'release-v1'), libraryScale('entry-v2', 'release-v2', 'f'.repeat(64)), libraryScale('entry-v1', 'release-v1'),
    ]))
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    const sql = mocks.tx.$queryRaw.mock.calls[0][0]
    expect(sql.values).toEqual(['entry-v1', 'entry-v2'])
    expect(sql.sql).toContain("entry.status='ACTIVE' AND submission.status='APPROVED'")
    expect(sql.sql).toContain("m.family='SCALE' AND m.layer='MEASUREMENT' AND m.status='PUBLISHED'")
    expect(sql.sql).toContain("policy.resource_key='release:'||m.id AND policy.fingerprint=m.content_hash")
    expect(sql.sql).toContain("policy.decision='APPROVED' AND NOT policy.paused")
    expect(sql.sql).toContain('scale_library_emergency_stops')
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.tx, {
      product: 'SURVEY', subjectId: 'owner', publicationId: 'publication', toolKeys: ['SCALE:authoring:stable-family'],
    })
  })

  it.each(['unavailable', 'release', 'hash'])('rejects %s exact library source before charging', async failure => {
    mocks.tx.$queryRaw.mockResolvedValue(failure === 'unavailable' ? [] : [{
      id: 'entry', release_id: failure === 'release' ? 'another-release' : 'release',
      content_hash: failure === 'hash' ? 'f'.repeat(64) : 'e'.repeat(64), content_key: 'authoring:stable-family',
    }])
    await expect(authorizeSurveyStandardPublication(tx(), input([libraryScale('entry', 'release')]))).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('rejects missing frozen release proofs, contradictory entry references or two releases under one exact entry', async () => {
    const malformed = libraryScale('entry', 'release')
    malformed.sourceProvenance.sourceMeasurementRelease.contentHash = ''
    await expect(authorizeSurveyStandardPublication(tx(), input([malformed]))).rejects.toThrow('冻结共享库量表来源不完整')
    const contradictory = libraryScale('entry', 'release')
    contradictory.sourceProvenance.source.sourceId = 'library:another-entry'
    await expect(authorizeSurveyStandardPublication(tx(), input([contradictory]))).rejects.toThrow('冻结共享库量表来源不完整')
    await expect(authorizeSurveyStandardPublication(tx(), input([libraryScale('entry', 'release'), libraryScale('entry', 'another-release')]))).rejects.toThrow('冻结共享库量表来源不一致')
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('keeps the original standard-only switch from adding library reads or charges', async () => {
    mocks.expanded.mockReturnValue(false)
    await authorizeSurveyStandardPublication(tx(), input([libraryScale('entry', 'release')]))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('licenses a governed wrapper or parent package once, without separately resolving its retained library component', async () => {
    const wrapper = { ...governed('wrapper', 'SCALE'), sourceProvenance: {
      ...libraryScale('entry', 'release').sourceProvenance, ...governed('wrapper', 'SCALE').sourceProvenance,
    } }
    const hash = 'd'.repeat(64), member = { ...libraryScale('entry', 'release'), sourceProvenance: {
      ...libraryScale('entry', 'release').sourceProvenance, surveyPackage: { importId: 'import', toolId: 'parent', hash },
    } }
    mocks.tx.$queryRaw.mockResolvedValue([
      { id: 'wrapper', family: 'SCALE', tool_key: 'SCALE:governed-wrapper', snapshot_hash: 'a'.repeat(64) },
      { id: 'parent', family: 'BUNDLE', tool_key: 'package', snapshot_hash: hash },
    ])
    await authorizeSurveyStandardPublication(tx(), { ...input([wrapper, member]),
      governedPackages: [{ importId: 'import', toolId: 'parent', family: 'BUNDLE', hash }],
    })
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.calls[0][0].sql).toContain('survey_governed_tools')
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ toolKeys: ['BUNDLE:package', 'SCALE:governed-wrapper'] }))
  })
})
