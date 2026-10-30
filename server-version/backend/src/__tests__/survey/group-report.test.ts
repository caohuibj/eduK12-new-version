import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { SurveySourceProjection } from '../../modules/survey/analytics.source'
import { summarizeGroupMetrics } from '../../modules/reporting/group-summary'

const m = vi.hoisted(() => ({ tx: { surveyWave: { findFirst: vi.fn() }, surveyProject: { findUnique: vi.fn() }, surveyWaveFinal: { findMany: vi.fn() } },
  transaction: vi.fn(), authorize: vi.fn(), source: vi.fn(), dictionary: vi.fn(), save: vi.fn(), read: vi.fn(), list: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $transaction: m.transaction } }))
vi.mock('../../modules/survey/builder.service', () => ({ authorizedProject: m.authorize }))
vi.mock('../../modules/survey/analytics.source', () => ({ loadSurveySource: m.source, loadSurveyItemDictionary: m.dictionary }))
vi.mock('../../modules/reporting/task-artifact', () => ({ saveTaskGroupArtifact: m.save, readTaskGroupArtifact: m.read,
  listTaskGroupArtifacts: m.list, publicTaskGroupArtifact: (value: unknown) => value }))
import { generateSurveyGroupReport, readSurveyGroupReport, surveyGroupCatalog, surveyGroupFacts } from '../../modules/survey/group-report.service'

const scope = { actorUserId: 'owner', projectId: 'project', waveId: 'wave' }
const measurement = (instrumentKey: string) => ({ instrumentKey, scoreKey: 'total', scoringDigest: 'score-c', responseSignature: 'content-c', respondentType: 'self', unit: 'score' })
const tool = (kind: 'SCALE' | 'COGNITIVE' | 'SJT' | 'FORM', instrumentKey = kind.toLowerCase()) => ({ instrumentKey, kind, title: kind, definitionDigest: 'content-c', scoringDigest: 'score-c' })
function source(): SurveySourceProjection {
  return { projectId: 'project', collectionMode: 'SINGLE_UNLINKED', completeAttempts: 2, sourceRevision: 7, cutOff: '2026-10-30T00:00:00.000Z', sourceFinalCount: 2,
    groupParents: [{ finalId: 'f1', attemptId: 'p1', sourceFinalHash: 'h1' }, { finalId: 'f2', attemptId: 'p2', sourceFinalHash: 'h2' }],
    groupTools: [tool('SCALE'), tool('COGNITIVE'), tool('SJT'), tool('FORM')],
    scores: ['scale', 'cognitive', 'sjt'].flatMap(instrumentKey => [0, 2].map((value, i) => ({ projectId: 'project', waveId: 'wave', waveOrdinal: 1, attemptId: `p${i + 1}`,
      researchCode: null, sourceFinalHash: `h${i + 1}`, sourceVerified: true as const, measurement: measurement(instrumentKey), value, missingReason: null, completedAt: '2026-10-30' }))),
    scoreColumns: ['scale', 'cognitive', 'sjt'].map(instrumentKey => ({ projectId: 'project', waveId: 'wave', waveOrdinal: 1, measurement: measurement(instrumentKey) })),
    raw: [], codebook: [], attendance: [] }
}
beforeEach(() => {
  vi.resetAllMocks(); m.transaction.mockImplementation(fn => fn(m.tx)); m.tx.surveyWave.findFirst.mockResolvedValue({ title: '本轮', publicationId: 'pub' })
  m.tx.surveyProject.findUnique.mockResolvedValue({ revision: 7 }); m.tx.surveyWaveFinal.findMany.mockResolvedValue([{ id: 'f1', resultsHash: 'h1' }, { id: 'f2', resultsHash: 'h2' }])
  m.source.mockResolvedValue(source()); m.dictionary.mockResolvedValue({ tools: source().groupTools }); m.list.mockResolvedValue([])
  m.save.mockImplementation(async (_db, artifact) => artifact)
})
describe('Survey task group artifacts', () => {
  it.each(['scale', 'cognitive', 'sjt'])('selects %s before metric extraction, so repeated total keys remain isolated', key => {
    const input = source(); input.scores.find(row => row.measurement.instrumentKey !== key)!.value = 900
    const facts = surveyGroupFacts(input, key)
    expect(summarizeGroupMetrics(facts.definitions, facts.observations, ['p1', 'p2'])[0]).toMatchObject({ key: 'total', mean: 1, validN: 2 })
    expect(facts.tool.instrumentKey).toBe(key)
  })
  it('adapts only real Form numbers and choice frequencies; excludes text and keeps missing null', () => {
    const input = source()
    input.codebook = ['NUMBER', 'SINGLE', 'MULTIPLE', 'LONG_TEXT'].map((responseType, i) => ({ columnKey: `c${i}`, itemKey: `q${i}`, prompt: responseType,
      instrumentKey: 'form', kind: 'FORM', responseType, waveId: 'wave', waveOrdinal: 1, title: 'Form', definitionDigest: 'c', scoringDigest: null,
      publicationVersion: 1, instrumentRevision: 1, options: [{ code: 'a', label: '甲' }, { code: 'b', label: '乙' }] }))
    input.raw = [0, 'a', '["a","b"]', 'private text'].map((value, i) => ({ projectId: 'project', waveId: 'wave', waveOrdinal: 1, attemptId: 'p1', researchCode: null,
      sourceFinalHash: 'h1', instrumentKey: 'form', kind: 'FORM', responseType: input.codebook[i].responseType, itemKey: `q${i}`, columnKey: `c${i}`, publicationVersion: 1,
      value, missingReason: null, completedAt: '2026-10-30', sourceVerified: true }))
    const facts = surveyGroupFacts(input, 'form'), summary = summarizeGroupMetrics(facts.definitions, facts.observations, ['p1', 'p2'])
    expect(summary).toHaveLength(3); expect(summary[0]).toMatchObject({ mean: 0, validN: 1, missingN: 1, sdSample: null })
    expect(summary[1].mean).toBeNull(); expect(summary[2].frequencies.map(cell => cell.proportion)).toEqual([1, 1])
    expect(JSON.stringify(summary)).not.toContain('private text')
  })
  it('catalog and saved reads never load/decrypt participant sources; read checks original pointers and authority', async () => {
    await surveyGroupCatalog(scope); expect(m.source).not.toHaveBeenCalled()
    const artifact = { artifactId: 'artifact', sourceBindings: { parents: source().groupParents }, projection: { frozen: true } }
    m.read.mockResolvedValue(artifact)
    expect(await readSurveyGroupReport({ ...scope, artifactId: 'artifact' })).toBe(artifact)
    expect(m.source).not.toHaveBeenCalled(); expect(m.authorize).toHaveBeenCalledTimes(2)
    expect(m.tx.surveyWaveFinal.findMany.mock.calls[0][0]).toMatchObject({ select: { id: true, resultsHash: true }, where: { id: { in: ['f1', 'f2'] } } })
  })
  it('generates one frozen snapshot and does not request raw cognitive trials', async () => {
    await generateSurveyGroupReport({ ...scope, instrumentKey: 'cognitive' })
    expect(m.source).toHaveBeenCalledTimes(1)
    expect(m.source.mock.calls[0][0]).toMatchObject({ selectRaw: false, selectScore: { instrumentKey: 'cognitive' } })
    expect(m.save.mock.calls[0][1]).toMatchObject({ selector: { kind: 'ALL', instrumentKey: 'cognitive' }, projection: { completedN: 2, assignedN: null, countUnit: 'RESPONSE' } })
    expect(m.save.mock.calls[0][1].projection.metrics[0]).toMatchObject({ validN: 2, mean: 1 })
  })
  it('rejects changed sample eligibility and cross-project authority before disclosing stored aggregate', async () => {
    m.read.mockResolvedValue({ sourceBindings: { parents: source().groupParents } }); m.tx.surveyWaveFinal.findMany.mockResolvedValue([{ id: 'f1', resultsHash: 'h1' }])
    await expect(readSurveyGroupReport({ ...scope, artifactId: 'artifact' })).rejects.toMatchObject({ statusCode: 409 })
    m.authorize.mockRejectedValue(new Error('no access')); await expect(readSurveyGroupReport({ ...scope, artifactId: 'artifact' })).rejects.toThrow('no access')
    expect(m.read).toHaveBeenCalledTimes(1)
  })
  it('rejects incompatible measurement identities instead of pooling them', () => {
    const input = source(); input.scores[0].measurement = { ...input.scores[0].measurement, scoringDigest: canonicalHash('other C') }
    expect(() => surveyGroupFacts(input, 'scale')).toThrow('不能混合统计')
  })
  it('pages a wide Form within 25k projected rows, skips text before projection and counts all 6000 FINALs beyond 30 pages', async () => {
    const { projectGroupRawItems } = await vi.importActual<typeof import('../../modules/survey/analytics.source')>('../../modules/survey/analytics.source')
    const items = Array.from({ length: 500 }, (_, i) => ({ itemKey: `q${i}`, answerKey: `q${i}`, prompt: `Q${i}`,
      responseType: i < 126 ? 'SINGLE' : 'LONG_TEXT', options: i < 126 ? [{ code: 'a', label: '甲' }] : [] }))
    const unit = { instrumentKey: 'form', kind: 'FORM' as const, sourceDigest: 'c', scoringDigest: null,
      rawAnswers: Object.fromEntries(items.map(item => [item.itemKey, item.responseType === 'SINGLE' ? 'a' : 'private free text'])), missing: [], privateScoring: null }
    const projected = projectGroupRawItems(items, unit)
    expect(projected).toHaveLength(126); expect(projected.every(row => row.item.responseType === 'SINGLE')).toBe(true)
    const baseSource = source(), book = items.map((item, i) => ({ columnKey: `c${i}`, itemKey: item.itemKey, prompt: item.prompt,
      instrumentKey: 'form', kind: 'FORM' as const, responseType: item.responseType, waveId: 'wave', waveOrdinal: 1,
      title: 'Wide Form', definitionDigest: 'c', scoringDigest: null, publicationVersion: 1, instrumentRevision: 1, options: item.options }))
    m.dictionary.mockResolvedValue({ tools: [tool('FORM')], variables: book })
    let processed = 0
    m.source.mockImplementation(async (request: { maxFinals: number; afterFinal?: { id: string } }) => {
      expect(request.maxFinals).toBe(198); expect(request.maxFinals * projected.length).toBeLessThanOrEqual(25000)
      if (processed) expect(request.afterFinal?.id).toBe(`f${processed}`)
      const count = Math.min(request.maxFinals, 6000 - processed)
      const groupParents = Array.from({ length: count }, (_, i) => ({ finalId: `f${processed + i + 1}`, attemptId: `p${processed + i + 1}`, sourceFinalHash: 'h' }))
      processed += count
      return { ...baseSource, completeAttempts: count, sourceFinalCount: 6000, groupTools: [tool('FORM')], groupParents, codebook: book,
        nextFinalCursor: processed < 6000 ? { id: `f${processed}`, completedAt: baseSource.cutOff } : null,
        scores: [], raw: groupParents.flatMap(parent => projected.map((answer, i) => ({ projectId: 'project', waveId: 'wave', waveOrdinal: 1,
          attemptId: parent.attemptId, researchCode: null, sourceFinalHash: 'h', instrumentKey: 'form', kind: 'FORM', responseType: 'SINGLE',
          itemKey: answer.item.itemKey, columnKey: `c${i}`, publicationVersion: 1, value: answer.value, missingReason: null, completedAt: baseSource.cutOff, sourceVerified: true }))) }
    })
    await generateSurveyGroupReport({ ...scope, instrumentKey: 'form' })
    expect(m.source).toHaveBeenCalledTimes(31); expect(processed).toBe(6000)
    expect(m.save.mock.calls[0][1].projection).toMatchObject({ completedN: 6000, metrics: expect.arrayContaining([
      expect.objectContaining({ key: 'q0', validN: 6000, frequencies: [{ value: 'a', label: '甲', count: 6000, proportion: 1 }] }),
    ]) })
    expect(m.save.mock.calls[0][1].projection.metrics).toHaveLength(126)
  },15000)
})
