import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'

const state = vi.hoisted(() => ({
  query: vi.fn(), access: vi.fn(), artifact: vi.fn(), waves: vi.fn(),
  spec: vi.fn(), entry: vi.fn(), projection: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: state.query } }))
vi.mock('../../modules/organization/access', () => ({ resolveOrganizationAccessContext: state.access }))
vi.mock('../../modules/assessment-run/registeredResources', () => ({ resolveHistoricalRelationalEntry: state.entry }))
vi.mock('../../modules/reporting/artifact', () => ({ readReportingArtifactRecord: state.artifact }))
vi.mock('../../modules/reporting/series', () => ({ readExactReportingSeriesWavesBatch: state.waves }))
vi.mock('../../modules/reporting/spec', () => ({ getPublishedReportingSpec: state.spec }))
vi.mock('../../modules/reporting/participantProjection', () => ({ projectParticipantLongitudinal: state.projection }))
import { readParticipantLongitudinal } from '../../modules/reporting/participantService'

const context = () => ({
  membershipId: 'member', organizationStatus: 'ACTIVE', explicitDenies: [],
})
function fixture(size: number) {
  const disclosure = testDisclosure()
  disclosure.audiences.RESPONDENT = {
    mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['score'], longitudinalMetricKeys: ['score'],
  }
  const policy = { resultDisclosure: disclosure }
  const waves = Array.from({ length: size }, (_, i) => ({
    sourceRunId: 'run-' + i, sourceTrackId: 'track-' + i,
    inputManifest: { resolved: [{ subjectUserId: 'self', executionId: 'execution-' + i }], unresolved: [] },
  }))
  const tracks = waves.map(w => ({
    runId: w.sourceRunId, trackId: w.sourceTrackId, family: 'SCALE', key: 'scale',
    version: 'v1', policy, hash: canonicalHash(policy),
  }))
  const executions = waves.map((w, i) => ({
    runId: w.sourceRunId, trackId: w.sourceTrackId, id: 'execution-' + i,
  }))
  state.artifact.mockResolvedValue({
    organizationId: 'org', subjectUserId: 'self', analysisKind: 'INDIVIDUAL_LONGITUDINAL',
    seriesId: 'series', specId: 'spec', artifactPayload: { waveBindings: [], projection: {} },
  })
  state.waves.mockResolvedValue(waves)
  state.spec.mockResolvedValue({ definition: {
    analysisKind: 'INDIVIDUAL_LONGITUDINAL',
    metricRules: [{ metricId: 'score', sourceFamily: 'SCALE', sourceResourceKey: 'scale', sourceMetricKey: 'score' }],
  } })
  state.entry.mockResolvedValue({ releaseStatus: 'PUBLISHED', resultDisclosure: disclosure })
  state.projection.mockImplementation((_p, ids) => ({ metrics: ids }))
  state.query.mockImplementation(async (sql: any) => {
    const text = Array.isArray(sql) ? sql.join('') : sql.strings.join('')
    if (text.includes('FROM reporting_analysis_artifacts')) return [{ organizationId: 'org' }]
    if (text.includes('FROM assessment_run_tracks t')) return tracks
    if (text.includes('FROM (VALUES')) return executions
    throw new Error('Unexpected query')
  })
  return { waves, tracks, executions, disclosure }
}
describe('Participant source batch reads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.access.mockImplementation(async () => context())
  })
  it.each([2, 12])('keeps two source queries for %i waves and live access at both boundaries', async size => {
    fixture(size)
    expect(await readParticipantLongitudinal('self', 'artifact')).toEqual({ metrics: ['score'] })
    expect(state.query).toHaveBeenCalledTimes(3) // ownership + tracks + executions
    expect(state.access).toHaveBeenCalledTimes(2)
    expect(state.entry).toHaveBeenCalledTimes(size)
  })
  it('rejects an observer population before loading source content', async () => {
    const f = fixture(2)
    f.waves[1].inputManifest.resolved[0].subjectUserId = 'other'
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.query).toHaveBeenCalledTimes(1)
    expect(state.entry).not.toHaveBeenCalled()
  })
  it('rejects a missing exact track', async () => {
    const f = fixture(2)
    f.tracks.pop()
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.projection).not.toHaveBeenCalled()
  })
  it('rejects ambiguous SELF executions in one source without affecting other bindings', async () => {
    const f = fixture(2)
    f.executions.push({ ...f.executions[1], id: 'second-self-execution' })
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.projection).not.toHaveBeenCalled()
  })
  it('rejects an execution from a different exact source', async () => {
    const f = fixture(2)
    f.executions[1].runId = 'other-run'
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('does not skip revoked content contracts', async () => {
    fixture(2)
    state.entry.mockResolvedValueOnce({ releaseStatus: 'REVOKED' })
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.projection).not.toHaveBeenCalled()
  })
  it('observes an execution revoked during registry validation', async () => {
    const f = fixture(2)
    state.entry.mockImplementation(async () => {
      f.executions.splice(1)
      return { releaseStatus: 'PUBLISHED', resultDisclosure: f.disclosure }
    })
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('honors an access deny applied before response projection', async () => {
    fixture(2)
    state.access.mockResolvedValueOnce(context()).mockResolvedValueOnce({
      ...context(), explicitDenies: ['PARTICIPANT_REPORT_READ'],
    })
    await expect(readParticipantLongitudinal('self', 'artifact')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.projection).not.toHaveBeenCalled()
  })
})
